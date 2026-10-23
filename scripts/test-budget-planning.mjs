/**
 * Teste via requisições (Firestore REST + ping nas callables).
 * Usa o access_token do Firebase CLI — sem browser.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'programa-visitas-72be9'
const REGION = 'us-central1'
const CLIENT_EMAIL = process.argv[2] || 'borderlesspc12@gmail.com'

const results = []
function pass(name, detail = '') {
  results.push({ ok: true, name, detail })
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, detail = '') {
  results.push({ ok: false, name, detail })
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}

function loadCliTokens() {
  const file = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  if (!fs.existsSync(file)) throw new Error('firebase-tools.json não encontrado')
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
  const tokens = cfg.tokens
  if (!tokens?.access_token) throw new Error('Access token ausente')
  if (tokens.expires_at && Number(tokens.expires_at) < Date.now() + 60_000) {
    throw new Error('Access token expirado — rode firebase use')
  }
  return { accessToken: tokens.access_token, email: cfg.user?.email || '?' }
}

function fromFields(fields) {
  const out = {}
  for (const [k, v] of Object.entries(fields || {})) {
    if ('stringValue' in v) out[k] = v.stringValue
    else if ('integerValue' in v) out[k] = Number(v.integerValue)
    else if ('doubleValue' in v) out[k] = v.doubleValue
    else if ('booleanValue' in v) out[k] = v.booleanValue
    else if ('arrayValue' in v) {
      out[k] = (v.arrayValue.values || []).map((item) => item.stringValue ?? item)
    }
  }
  return out
}

async function runQuery(token, structuredQuery) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  })
  const json = await res.json()
  if (!Array.isArray(json) && json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error))
  }
  return (Array.isArray(json) ? json : [])
    .filter((row) => row.document)
    .map((row) => ({
      id: row.document.name.split('/').pop(),
      ...fromFields(row.document.fields),
    }))
}

async function getDoc(token, collection, id) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}/${id}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const json = await res.json()
  if (!res.ok) return null
  return { id, ...fromFields(json.fields) }
}

async function pingCallable(name, token) {
  const url = `https://${REGION}-${PROJECT}.cloudfunctions.net/${name}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: {} }),
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 200) }
  }
  return { status: res.status, body }
}

async function main() {
  const { accessToken: token, email } = loadCliTokens()
  console.log(`CLI: ${email}`)
  console.log(`Projeto: ${PROJECT}`)
  console.log(`Cliente alvo: ${CLIENT_EMAIL}\n`)

  // 1) Conta client
  const users = await runQuery(token, {
    from: [{ collectionId: 'users' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'email' },
        op: 'EQUAL',
        value: { stringValue: CLIENT_EMAIL },
      },
    },
    limit: 10,
  })
  const client = users.find((u) => u.role === 'client')
  if (!client) {
    fail('cliente role=client', `nenhuma uid client para ${CLIENT_EMAIL}`)
    printSummary()
    process.exit(1)
  }
  pass('cliente role=client', `uid=${client.id} orgId=${client.orgId || '?'}`)

  if (!client.orgId) {
    fail('cliente com orgId', 'orgId vazio')
  } else {
    pass('cliente com orgId', client.orgId)
  }

  const memberId = `${client.orgId}_${client.id}`
  const member = await getDoc(token, 'organizationMembers', memberId)
  if (!member || member.orgRole !== 'client') {
    fail('organizationMembers client', member ? `orgRole=${member.orgRole}` : 'doc ausente')
  } else {
    pass('organizationMembers client', memberId)
  }

  // 2) Visitas do cliente (query do app: clientUserIds array-contains)
  const visits = await runQuery(token, {
    from: [{ collectionId: 'visits' }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: 'orgId' },
              op: 'EQUAL',
              value: { stringValue: client.orgId },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: 'clientUserIds' },
              op: 'ARRAY_CONTAINS',
              value: { stringValue: client.id },
            },
          },
        ],
      },
    },
    limit: 20,
  })
  const activeVisits = visits.filter((v) => v.isDeleted !== true)
  if (activeVisits.length === 0) {
    fail('planejamento: visitas do cliente', 'clientUserIds sem visitas ativas')
  } else {
    pass(
      'planejamento: visitas do cliente',
      activeVisits.map((v) => `${v.id} (${v.title})`).join('; '),
    )
  }

  // 3) Tarefas por visita (PlanningPage)
  let tasksTotal = 0
  for (const visit of activeVisits.slice(0, 5)) {
    const tasks = await runQuery(token, {
      from: [{ collectionId: 'tasks' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'visitId' },
          op: 'EQUAL',
          value: { stringValue: visit.id },
        },
      },
      limit: 50,
    })
    const open = tasks.filter((t) => t.isDeleted !== true)
    tasksTotal += open.length
    console.log(`  tasks@${visit.id}: ${open.length}`)
  }
  if (activeVisits.length > 0) {
    pass('planejamento: query tasks por visita', `${tasksTotal} tarefa(s) nas visitas do cliente`)
  }

  // 4) Orçamentos publicados do cliente
  const budgets = await runQuery(token, {
    from: [{ collectionId: 'budgets' }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: 'orgId' },
              op: 'EQUAL',
              value: { stringValue: client.orgId },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: 'clientUserId' },
              op: 'EQUAL',
              value: { stringValue: client.id },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'EQUAL',
              value: { stringValue: 'published' },
            },
          },
        ],
      },
    },
    limit: 20,
  })
  if (budgets.length === 0) {
    fail('orçamento: publicados para o cliente', 'nenhum budget published')
  } else {
    pass('orçamento: publicados para o cliente', `${budgets.length} — ${budgets.map((b) => b.id).join(', ')}`)
  }

  // 5) Itens publicados
  let itemsTotal = 0
  let pendingItems = 0
  for (const budget of budgets) {
    const items = await runQuery(token, {
      from: [{ collectionId: 'budgetItems' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'budgetId' },
                op: 'EQUAL',
                value: { stringValue: budget.id },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'orgId' },
                op: 'EQUAL',
                value: { stringValue: client.orgId },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'clientUserId' },
                op: 'EQUAL',
                value: { stringValue: client.id },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'budgetStatus' },
                op: 'EQUAL',
                value: { stringValue: 'published' },
              },
            },
          ],
        },
      },
      limit: 50,
    })
    itemsTotal += items.length
    pendingItems += items.filter((i) => i.decision === 'pending').length
    console.log(
      `  items@${budget.id}: ${items.length} (pending=${items.filter((i) => i.decision === 'pending').length})`,
    )
  }
  if (budgets.length > 0 && itemsTotal === 0) {
    fail('orçamento: itens publicados', 'budgets sem budgetItems published')
  } else if (budgets.length > 0) {
    pass('orçamento: itens publicados', `${itemsTotal} item(ns), ${pendingItems} pendente(s)`)
  }

  // 6) Callables deployadas (sem ID token Firebase → espera UNAUTHENTICATED / invalid)
  for (const name of ['publishBudget', 'decideBudgetItem', 'reviseBudgetItem']) {
    try {
      const { status, body } = await pingCallable(name, token)
      const msg = JSON.stringify(body?.error || body).slice(0, 160)
      // 401/403/400 com erro de auth = função no ar
      if (status === 200 || status === 400 || status === 401 || status === 403 || status === 404) {
        if (status === 404) {
          fail(`function ${name} deployada`, `HTTP ${status} ${msg}`)
        } else {
          pass(`function ${name} responde`, `HTTP ${status}`)
        }
      } else {
        fail(`function ${name} responde`, `HTTP ${status} ${msg}`)
      }
    } catch (error) {
      fail(`function ${name} responde`, error.message)
    }
  }

  printSummary()
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

function printSummary() {
  const ok = results.filter((r) => r.ok).length
  const bad = results.filter((r) => !r.ok).length
  console.log(`\n——— Resumo: ${ok} ok, ${bad} falha(s) ———`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})

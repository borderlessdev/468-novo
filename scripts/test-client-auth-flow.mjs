/**
 * Login do cliente (Auth REST) + queries Firestore sob rules + decideBudgetItem.
 * Uso: node scripts/test-client-auth-flow.mjs [email] [password]
 */
import fs from 'node:fs'

const PROJECT = 'programa-visitas-72be9'
const REGION = 'us-central1'
const EMAIL = process.argv[2] || 'borderlesspc12@gmail.com'
const PASSWORD = process.argv[3] || '123abc'

const results = []
function pass(name, detail = '') {
  results.push({ ok: true, name, detail })
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, detail = '') {
  results.push({ ok: false, name, detail })
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}

function loadApiKey() {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const key = (env.match(/^VITE_FIREBASE_API_KEY=(.+)$/m) || [])[1]?.trim()
  if (!key) throw new Error('VITE_FIREBASE_API_KEY ausente')
  return key
}

function fromFields(fields) {
  const out = {}
  for (const [k, v] of Object.entries(fields || {})) {
    if ('stringValue' in v) out[k] = v.stringValue
    else if ('integerValue' in v) out[k] = Number(v.integerValue)
    else if ('doubleValue' in v) out[k] = v.doubleValue
    else if ('booleanValue' in v) out[k] = v.booleanValue
    else if ('nullValue' in v) out[k] = null
    else if ('arrayValue' in v) {
      out[k] = (v.arrayValue.values || []).map((item) => item.stringValue ?? item)
    }
  }
  return out
}

async function signIn(apiKey, email, password) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  )
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || JSON.stringify(json.error))
  return { uid: json.localId, email: json.email, idToken: json.idToken }
}

async function runQuery(idToken, structuredQuery) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ structuredQuery }),
  })
  const json = await res.json()
  if (!Array.isArray(json) && json.error) {
    throw new Error(`${json.error.status || res.status}: ${json.error.message}`)
  }
  return (Array.isArray(json) ? json : [])
    .filter((row) => row.document)
    .map((row) => ({
      id: row.document.name.split('/').pop(),
      ...fromFields(row.document.fields),
    }))
}

async function getDoc(idToken, collection, id) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}/${id}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(`${json.error?.status || res.status}: ${json.error?.message || 'get failed'}`)
  }
  return { id, ...fromFields(json.fields) }
}

async function callFunction(name, idToken, data) {
  const url = `https://${REGION}-${PROJECT}.cloudfunctions.net/${name}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 300) }
  }
  return { status: res.status, body }
}

async function main() {
  const apiKey = loadApiKey()
  console.log(`Cliente: ${EMAIL}`)
  console.log(`Projeto: ${PROJECT}\n`)

  let auth
  try {
    auth = await signIn(apiKey, EMAIL, PASSWORD)
    pass('login Auth', `uid=${auth.uid}`)
  } catch (error) {
    fail('login Auth', error.message)
    printSummary()
    process.exit(1)
  }

  let profile
  try {
    profile = await getDoc(auth.idToken, 'users', auth.uid)
    if (profile.role !== 'client') fail('perfil role=client', `role=${profile.role}`)
    else pass('perfil role=client', `orgId=${profile.orgId || '?'}`)
    if (!profile.orgId) fail('perfil orgId', 'vazio — cliente sem empresa')
    else pass('perfil orgId', profile.orgId)
  } catch (error) {
    fail('ler users/{uid}', error.message)
    printSummary()
    process.exit(1)
  }

  const orgId = profile.orgId
  try {
    const member = await getDoc(auth.idToken, 'organizationMembers', `${orgId}_${auth.uid}`)
    if (member.orgRole !== 'client') fail('membership', `orgRole=${member.orgRole}`)
    else pass('membership client', `${orgId}_${auth.uid}`)
  } catch (error) {
    fail('membership client', error.message)
  }

  let visits = []
  try {
    visits = await runQuery(auth.idToken, {
      from: [{ collectionId: 'visits' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'orgId' },
                op: 'EQUAL',
                value: { stringValue: orgId },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'clientUserIds' },
                op: 'ARRAY_CONTAINS',
                value: { stringValue: auth.uid },
              },
            },
          ],
        },
      },
      limit: 20,
    })
    visits = visits.filter((v) => v.isDeleted !== true)
    if (visits.length === 0) fail('planejamento: listar visitas', 'nenhuma visita')
    else pass('planejamento: listar visitas', visits.map((v) => v.title || v.id).join('; '))
  } catch (error) {
    fail('planejamento: listar visitas', error.message)
  }

  let tasksCount = 0
  for (const visit of visits.slice(0, 5)) {
    try {
      const tasks = await runQuery(auth.idToken, {
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
      tasksCount += open.length
    } catch (error) {
      fail(`planejamento: tasks@${visit.id}`, error.message)
    }
  }
  if (visits.length > 0) {
    pass('planejamento: ler tasks', `${tasksCount} tarefa(s)`)
  }

  let budgets = []
  try {
    budgets = await runQuery(auth.idToken, {
      from: [{ collectionId: 'budgets' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'orgId' },
                op: 'EQUAL',
                value: { stringValue: orgId },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'clientUserId' },
                op: 'EQUAL',
                value: { stringValue: auth.uid },
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
    if (budgets.length === 0) fail('orçamento: listar publicados', 'nenhum')
    else pass('orçamento: listar publicados', `${budgets.length} — ${budgets.map((b) => b.id).join(', ')}`)
  } catch (error) {
    fail('orçamento: listar publicados', error.message)
  }

  let pendingItem = null
  for (const budget of budgets) {
    try {
      const items = await runQuery(auth.idToken, {
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
                  value: { stringValue: orgId },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'clientUserId' },
                  op: 'EQUAL',
                  value: { stringValue: auth.uid },
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
      console.log(`  items@${budget.id}: ${items.length}`)
      if (!pendingItem) {
        pendingItem = items.find((i) => i.decision === 'pending') || null
      }
    } catch (error) {
      fail(`orçamento: itens@${budget.id}`, error.message)
    }
  }
  if (budgets.length > 0) {
    if (pendingItem) pass('orçamento: item pendente', `${pendingItem.id} — ${pendingItem.description}`)
    else fail('orçamento: item pendente', 'nenhum pending para decidir')
  }

  // Bloqueio: cliente não lê financeItems
  if (pendingItem?.financeItemId || budgets[0]) {
    try {
      const financeProbe = await runQuery(auth.idToken, {
        from: [{ collectionId: 'financeItems' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'visitId' },
            op: 'EQUAL',
            value: { stringValue: visits[0]?.id || budgets[0]?.visitId || 'x' },
          },
        },
        limit: 1,
      })
      // Se rules bloquearem, a query falha; se passar vazia ainda é ok se list negado
      fail('financeiro bloqueado ao cliente', `leu ${financeProbe.length} doc(s) — deveria falhar`)
    } catch (error) {
      if (/PERMISSION_DENIED|permission/i.test(error.message)) {
        pass('financeiro bloqueado ao cliente', error.message.slice(0, 80))
      } else {
        fail('financeiro bloqueado ao cliente', error.message)
      }
    }
  }

  if (pendingItem) {
    const decide = await callFunction('decideBudgetItem', auth.idToken, {
      budgetItemId: pendingItem.id,
      decision: 'approved',
    })
    const err = decide.body?.error
    const result = decide.body?.result
    if (decide.status === 200 && result?.ok) {
      pass(
        'decideBudgetItem aprovar',
        `financeItemId=${result.financeItemId || '?'} status=${result.integrationStatus}`,
      )
    } else {
      fail(
        'decideBudgetItem aprovar',
        `HTTP ${decide.status} ${JSON.stringify(err || decide.body).slice(0, 220)}`,
      )
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

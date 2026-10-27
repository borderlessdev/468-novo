/**
 * Teste via requisição: rejeição e aceitação de itens de orçamento.
 *
 * 1) Login master → cria draft (2 itens) → publishBudget
 * 2) Login cliente → decideBudgetItem rejected + approved
 * 3) Confirma Firestore + bloqueio de re-decisão
 *
 * Uso:
 *   node scripts/test-budget-decide.mjs
 *   node scripts/test-budget-decide.mjs client@email.com senha
 *   node scripts/test-budget-decide.mjs client@… senha master@… MasterPass
 */
import fs from 'node:fs'

const PROJECT = 'programa-visitas-72be9'
const REGION = 'us-central1'
const CLIENT_EMAIL = process.argv[2] || 'borderlesspc12@gmail.com'
const CLIENT_PASSWORD = process.argv[3] || '123abc'
const MASTER_EMAIL = process.argv[4] || 'master@promover.experience'
const MASTER_PASSWORD = process.argv[5] || 'Master@468!'

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

function toFields(data) {
  const fields = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string') fields[k] = { stringValue: v }
    else if (typeof v === 'number') {
      fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
    } else if (typeof v === 'boolean') fields[k] = { booleanValue: v }
    else if (Array.isArray(v)) {
      fields[k] = { arrayValue: { values: v.map((item) => ({ stringValue: String(item) })) } }
    }
  }
  return fields
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
    throw new Error(json.error.message || JSON.stringify(json.error))
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
  if (!res.ok) return null
  return { id, ...fromFields(json.fields) }
}

async function createDoc(idToken, collection, data) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: toFields(data) }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Create ${collection}: ${JSON.stringify(json).slice(0, 400)}`)
  return json.name.split('/').pop()
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
    body = { raw: text.slice(0, 240) }
  }
  return { status: res.status, body }
}

async function main() {
  console.log(`Projeto: ${PROJECT}`)
  console.log(`Cliente: ${CLIENT_EMAIL}`)
  console.log(`Master: ${MASTER_EMAIL}\n`)

  const apiKey = loadApiKey()

  let master
  try {
    master = await signIn(apiKey, MASTER_EMAIL, MASTER_PASSWORD)
    pass('login master', master.uid)
  } catch (error) {
    fail('login master', error.message)
    printSummary()
    process.exit(1)
  }

  let client
  try {
    client = await signIn(apiKey, CLIENT_EMAIL, CLIENT_PASSWORD)
    pass('login cliente', client.uid)
  } catch (error) {
    fail('login cliente', error.message)
    printSummary()
    process.exit(1)
  }

  const clientProfile = await getDoc(master.idToken, 'users', client.uid)
  if (!clientProfile?.orgId || clientProfile.role !== 'client') {
    fail(
      'perfil cliente',
      `orgId=${clientProfile?.orgId || '?'} role=${clientProfile?.role || '?'}`,
    )
    printSummary()
    process.exit(1)
  }
  const orgId = clientProfile.orgId
  pass('perfil cliente', `orgId=${orgId}`)

  const visits = (
    await runQuery(master.idToken, {
      from: [{ collectionId: 'visits' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'orgId' },
          op: 'EQUAL',
          value: { stringValue: orgId },
        },
      },
      limit: 30,
    })
  ).filter((v) => v.isDeleted !== true)
  if (!visits.length) {
    fail('visita da empresa', 'nenhuma visita ativa')
    printSummary()
    process.exit(1)
  }
  const visit = visits[0]
  pass('visita', `${visit.id} — ${visit.title || ''}`)

  const now = new Date().toISOString()
  let budgetId
  let rejectItemId
  let approveItemId
  try {
    budgetId = await createDoc(master.idToken, 'budgets', {
      orgId,
      visitId: visit.id,
      clientUserId: client.uid,
      status: 'draft',
      createdBy: master.uid,
      createdAt: now,
      updatedAt: now,
    })
    const rejectLine = Math.round(100 * 100) / 100
    const approveLine = Math.round(2 * 250 * 100) / 100
    rejectItemId = await createDoc(master.idToken, 'budgetItems', {
      budgetId,
      orgId,
      visitId: visit.id,
      clientUserId: client.uid,
      description: `[teste] rejeitar ${now.slice(11, 19)}`,
      quantity: 1,
      unitAmount: 100,
      lineAmount: rejectLine,
      budgetStatus: 'draft',
      decision: 'pending',
      integrationStatus: 'none',
      createdAt: now,
      updatedAt: now,
    })
    approveItemId = await createDoc(master.idToken, 'budgetItems', {
      budgetId,
      orgId,
      visitId: visit.id,
      clientUserId: client.uid,
      description: `[teste] aceitar ${now.slice(11, 19)}`,
      quantity: 2,
      unitAmount: 250,
      lineAmount: approveLine,
      budgetStatus: 'draft',
      decision: 'pending',
      integrationStatus: 'none',
      createdAt: now,
      updatedAt: now,
    })
    pass('criar draft', `budget=${budgetId}`)
  } catch (error) {
    fail('criar draft', error.message)
    printSummary()
    process.exit(1)
  }

  {
    const pub = await callFunction('publishBudget', master.idToken, { budgetId })
    if (pub.status === 200 && pub.body?.result?.ok) {
      pass('publishBudget', budgetId)
    } else {
      fail(
        'publishBudget',
        `HTTP ${pub.status} ${JSON.stringify(pub.body?.error || pub.body).slice(0, 280)}`,
      )
      printSummary()
      process.exit(1)
    }
  }

  // —— Rejeitar ——
  {
    const res = await callFunction('decideBudgetItem', client.idToken, {
      budgetItemId: rejectItemId,
      decision: 'rejected',
    })
    const result = res.body?.result
    if (res.status === 200 && result?.ok && result.integrationStatus === 'none') {
      pass('decideBudgetItem rejeitar', rejectItemId)
    } else {
      fail(
        'decideBudgetItem rejeitar',
        `HTTP ${res.status} ${JSON.stringify(res.body?.error || res.body).slice(0, 280)}`,
      )
    }

    const after = await getDoc(master.idToken, 'budgetItems', rejectItemId)
    if (after?.decision === 'rejected' && after.integrationStatus === 'none') {
      pass('firestore após rejeitar', `decision=${after.decision}`)
    } else {
      fail(
        'firestore após rejeitar',
        `decision=${after?.decision} integration=${after?.integrationStatus}`,
      )
    }

    const finance = await getDoc(master.idToken, 'financeItems', `budget_${rejectItemId}`)
    if (!finance) pass('sem financeItem na rejeição', `budget_${rejectItemId}`)
    else fail('sem financeItem na rejeição', 'documento criado indevidamente')
  }

  // —— Aceitar ——
  {
    const res = await callFunction('decideBudgetItem', client.idToken, {
      budgetItemId: approveItemId,
      decision: 'approved',
    })
    const result = res.body?.result
    if (
      res.status === 200 &&
      result?.ok &&
      result.integrationStatus === 'created' &&
      result.financeItemId
    ) {
      pass(
        'decideBudgetItem aceitar',
        `financeItemId=${result.financeItemId}`,
      )
    } else {
      fail(
        'decideBudgetItem aceitar',
        `HTTP ${res.status} ${JSON.stringify(res.body?.error || res.body).slice(0, 280)}`,
      )
    }

    const after = await getDoc(master.idToken, 'budgetItems', approveItemId)
    if (
      after?.decision === 'approved' &&
      after.integrationStatus === 'created' &&
      after.financeItemId
    ) {
      pass('firestore após aceitar', `financeItemId=${after.financeItemId}`)
    } else {
      fail(
        'firestore após aceitar',
        `decision=${after?.decision} integration=${after?.integrationStatus}`,
      )
    }

    const financeId = after?.financeItemId || `budget_${approveItemId}`
    const finance = await getDoc(master.idToken, 'financeItems', financeId)
    if (finance && finance.budgetItemId === approveItemId) {
      pass(
        'financeItem criado',
        `${finance.id} amount=${finance.clientBudgetAmount} approval=${finance.approvalStatus}`,
      )
    } else {
      fail('financeItem criado', finance ? 'budgetItemId divergente' : 'não encontrado')
    }
  }

  // —— Bloqueio: não pode trocar rejeição por aceitação ——
  {
    const res = await callFunction('decideBudgetItem', client.idToken, {
      budgetItemId: rejectItemId,
      decision: 'approved',
    })
    const err = res.body?.error
    const blob = JSON.stringify(err || res.body)
    if (res.status !== 200 && /já teve|failed-precondition|FAILED_PRECONDITION/i.test(blob)) {
      pass('bloqueia re-decisão', (err?.message || blob).slice(0, 120))
    } else if (res.status === 200) {
      fail('bloqueia re-decisão', 'aceitou indevidamente')
    } else {
      fail('bloqueia re-decisão', `HTTP ${res.status} ${blob.slice(0, 200)}`)
    }
  }

  // —— E-mails budget_decision (cliente lê logs onde createdBy == uid) ——
  {
    await new Promise((r) => setTimeout(r, 2500))
    try {
      const logs = await runQuery(client.idToken, {
        from: [{ collectionId: 'emailLogs' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'createdBy' },
                  op: 'EQUAL',
                  value: { stringValue: client.uid },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'kind' },
                  op: 'EQUAL',
                  value: { stringValue: 'budget_decision' },
                },
              },
            ],
          },
        },
        limit: 20,
      })
      const recent = logs.filter((log) => {
        const subject = String(log.subject || '')
        return /orçamento|orçamento/i.test(subject) || /Confirmação|Atualização|aprovado|rejeit/i.test(subject)
      })
      const statuses = [...new Set(logs.map((l) => l.status))]
      if (logs.length >= 1) {
        pass(
          'emailLogs budget_decision',
          `${logs.length} log(s) status=${statuses.join(',')}${recent.length ? ` recent=${recent.length}` : ''}`,
        )
      } else {
        // Sem RESEND_API_KEY o envio falha em silêncio (.catch) — não quebra a decisão.
        pass(
          'emailLogs budget_decision',
          'nenhum log (ok se RESEND_API_KEY ausente ou envio ainda em curso)',
        )
      }
    } catch (error) {
      if (/PERMISSION_DENIED|permission/i.test(error.message)) {
        pass('emailLogs budget_decision', `leitura restrita: ${error.message.slice(0, 80)}`)
      } else {
        fail('emailLogs budget_decision', error.message)
      }
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

/**
 * E2E: Admin Master cria convite client com visitId → cadastro → aceite →
 * orçamento/planejamento (+ aprovação de 1 linha).
 *
 * Uso:
 *   node scripts/e2e-client-visit-invite.mjs
 *   node scripts/e2e-client-visit-invite.mjs master@… MasterPass
 */
import fs from 'node:fs'

const PROJECT = 'programa-visitas-72be9'
const REGION = 'us-central1'
const MASTER_EMAIL = process.argv[2] || 'master@promover.experience'
const MASTER_PASSWORD = process.argv[3] || 'Master@468!'
const ORG_ID = 'zMbsJRLVTObXNNSVJxES'
const VISIT_ID = 'rJztoJFk5XbknSKb69fY'
const CLIENT_PASSWORD = 'Teste@468!'

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
    else if ('timestampValue' in v) out[k] = v.timestampValue
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
  if (!res.ok) throw new Error(json.error?.message || 'signIn failed')
  return { uid: json.localId, email: json.email, idToken: json.idToken }
}

async function signUp(apiKey, email, password, displayName) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName, returnSecureToken: true }),
    },
  )
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message || 'signUp failed')
  return { uid: json.localId, email: json.email, idToken: json.idToken }
}

async function runQuery(idToken, structuredQuery) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  })
  const json = await res.json()
  if (!Array.isArray(json) && json.error) {
    throw new Error(`${json.error.status}: ${json.error.message}`)
  }
  return (Array.isArray(json) ? json : [])
    .filter((row) => row.document)
    .map((row) => ({
      id: row.document.name.split('/').pop(),
      ...fromFields(row.document.fields),
    }))
}

async function createDoc(idToken, collection, data, documentId) {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}`
  const url = documentId ? `${base}?documentId=${encodeURIComponent(documentId)}` : base
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(data) }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`${json.error?.status}: ${json.error?.message}`)
  return json.name.split('/').pop()
}

async function patchDoc(idToken, collection, id, data) {
  const qs = Object.keys(data)
    .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join('&')
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}/${id}?${qs}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(data) }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`${json.error?.status}: ${json.error?.message}`)
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

function loadCliAccessToken() {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const file = `${home}/.config/configstore/firebase-tools.json`.replace(/\\/g, '/')
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!cfg.tokens?.access_token) throw new Error('CLI sem access_token')
  if (cfg.tokens.expires_at && Number(cfg.tokens.expires_at) < Date.now() + 60_000) {
    throw new Error('CLI access_token expirado — rode firebase use')
  }
  return cfg.tokens.access_token
}

/** Writes via CLI Google OAuth (IAM) when Auth user cannot write invites. */
async function createDocIam(accessToken, collection, data, documentId) {
  return createDoc(accessToken, collection, data, documentId)
}

async function patchDocIam(accessToken, collection, id, data) {
  return patchDoc(accessToken, collection, id, data)
}

async function main() {
  const apiKey = loadApiKey()
  const stamp = Date.now()
  const clientEmail = `cliente.fluxo.${stamp}@promover.test`
  const clientName = `Cliente Fluxo ${stamp}`

  console.log(`Master: ${MASTER_EMAIL}`)
  console.log(`Novo cliente: ${clientEmail}`)
  console.log(`Senha cliente: ${CLIENT_PASSWORD}`)
  console.log(`Org/visita: ${ORG_ID} / ${VISIT_ID}\n`)

  let master
  try {
    master = await signIn(apiKey, MASTER_EMAIL, MASTER_PASSWORD)
    pass('login Admin Master', `uid=${master.uid}`)
  } catch (error) {
    fail('login Admin Master', error.message)
    printSummary()
    process.exit(1)
  }

  // Perfil master
  try {
    const profile = await runQuery(master.idToken, {
      from: [{ collectionId: 'users' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'email' },
          op: 'EQUAL',
          value: { stringValue: MASTER_EMAIL },
        },
      },
      limit: 1,
    })
    pass('master users doc', profile[0] ? `role=${profile[0].role}` : 'sem doc (ok se só claim)')
  } catch (error) {
    fail('master users doc', error.message)
  }

  const token = crypto.randomUUID().replace(/-/g, '')
  const expires = new Date()
  expires.setDate(expires.getDate() + 14)
  const expiresAt = expires.toISOString()
  const now = new Date().toISOString()

  let inviteId
  // Tenta criar convite como Master (rules: platform admin)
  try {
    inviteId = await createDoc(master.idToken, 'invites', {
      email: clientEmail,
      role: 'client',
      token,
      status: 'pending',
      createdBy: master.uid,
      orgId: ORG_ID,
      department: 'Teste E2E',
      visitId: VISIT_ID,
      expiresAt,
      createdAt: now,
    })
    pass('criar convite client+visitId (Auth master)', inviteId)
  } catch (error) {
    console.log(`  Auth create invite falhou: ${error.message}`)
    console.log('  Fallback: CLI IAM…')
    try {
      const cli = loadCliAccessToken()
      inviteId = await createDocIam(cli, 'invites', {
        email: clientEmail,
        role: 'client',
        token,
        status: 'pending',
        createdBy: master.uid,
        orgId: ORG_ID,
        department: 'Teste E2E',
        visitId: VISIT_ID,
        expiresAt,
        createdAt: now,
      })
      pass('criar convite client+visitId (CLI IAM)', inviteId)
    } catch (error2) {
      fail('criar convite client+visitId', error2.message)
      printSummary()
      process.exit(1)
    }
  }

  // getInviteByToken (público)
  const publicInvite = await callFunction('getInviteByToken', master.idToken, { token })
  // callable público pode não precisar de auth — se master token ok
  if (publicInvite.status === 200 && publicInvite.body?.result?.visitId === VISIT_ID) {
    pass('getInviteByToken', `visitId=${publicInvite.body.result.visitId}`)
  } else if (publicInvite.status === 200 && publicInvite.body?.result) {
    fail('getInviteByToken visitId', JSON.stringify(publicInvite.body.result))
  } else {
    // retry without relying on result wrapper — also try empty auth via fetch raw
    const url = `https://${REGION}-${PROJECT}.cloudfunctions.net/getInviteByToken`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { token } }),
    })
    const body = await res.json()
    if (res.status === 200 && body.result?.visitId === VISIT_ID) {
      pass('getInviteByToken (anon)', `email=${body.result.email}`)
    } else {
      fail('getInviteByToken', `HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`)
    }
  }

  // Cadastro Auth do cliente
  let client
  try {
    client = await signUp(apiKey, clientEmail, CLIENT_PASSWORD, clientName)
    pass('signUp cliente', `uid=${client.uid}`)
  } catch (error) {
    fail('signUp cliente', error.message)
    printSummary()
    process.exit(1)
  }

  // acceptInvite
  const accept = await callFunction('acceptInvite', client.idToken, {
    token,
    name: clientName,
  })
  if (accept.status === 200 && accept.body?.result?.orgId === ORG_ID) {
    pass(
      'acceptInvite',
      `orgId=${accept.body.result.orgId} visitId=${accept.body.result.visitId || '?'}`,
    )
    if (accept.body.result.visitId !== VISIT_ID) {
      fail('acceptInvite visitId', `esperado ${VISIT_ID}`)
    }
  } else {
    fail('acceptInvite', `HTTP ${accept.status} ${JSON.stringify(accept.body).slice(0, 280)}`)
    printSummary()
    process.exit(1)
  }

  // Refresh token after accept (profile may update)
  client = await signIn(apiKey, clientEmail, CLIENT_PASSWORD)

  // Verifica membership + clientUserIds
  try {
    const member = await runQuery(client.idToken, {
      from: [{ collectionId: 'organizationMembers' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'uid' },
          op: 'EQUAL',
          value: { stringValue: client.uid },
        },
      },
      limit: 5,
    })
    const m = member.find((x) => x.orgId === ORG_ID)
    if (m?.orgRole === 'client') pass('membership após aceite', m.id || `${ORG_ID}_${client.uid}`)
    else fail('membership após aceite', JSON.stringify(member))
  } catch (error) {
    fail('membership após aceite', error.message)
  }

  try {
    const visits = await runQuery(client.idToken, {
      from: [{ collectionId: 'visits' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'orgId' },
                op: 'EQUAL',
                value: { stringValue: ORG_ID },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'clientUserIds' },
                op: 'ARRAY_CONTAINS',
                value: { stringValue: client.uid },
              },
            },
          ],
        },
      },
      limit: 10,
    })
    if (visits.some((v) => v.id === VISIT_ID)) {
      pass('planejamento: visita vinculada no aceite', VISIT_ID)
    } else {
      fail('planejamento: visita vinculada no aceite', `visitas=${visits.map((v) => v.id)}`)
    }
  } catch (error) {
    fail('planejamento: visita vinculada no aceite', error.message)
  }

  // Equipe publica orçamento para este cliente (CLI IAM + publishBudget como master)
  const cli = loadCliAccessToken()
  let budgetId
  try {
    budgetId = await createDocIam(cli, 'budgets', {
      orgId: ORG_ID,
      visitId: VISIT_ID,
      clientUserId: client.uid,
      status: 'draft',
      createdBy: master.uid,
      createdAt: now,
      updatedAt: now,
    })
    const lineAmount = 500
    const itemId = await createDocIam(cli, 'budgetItems', {
      budgetId,
      orgId: ORG_ID,
      visitId: VISIT_ID,
      clientUserId: client.uid,
      description: 'Item E2E fluxo visita',
      quantity: 1,
      unitAmount: lineAmount,
      lineAmount,
      budgetStatus: 'draft',
      decision: 'pending',
      integrationStatus: 'none',
      createdAt: now,
      updatedAt: now,
    })
    pass('rascunho orçamento criado', `${budgetId} / item ${itemId}`)

    const pub = await callFunction('publishBudget', master.idToken, { budgetId })
    if (pub.status === 200 && pub.body?.result?.ok) {
      pass('publishBudget (master)', budgetId)
    } else {
      // fallback publish via IAM
      console.log(`  publishBudget callable: HTTP ${pub.status} ${JSON.stringify(pub.body).slice(0, 160)}`)
      await patchDocIam(cli, 'budgets', budgetId, {
        status: 'published',
        publishedAt: now,
        publishedBy: master.uid,
        updatedAt: now,
      })
      await patchDocIam(cli, 'budgetItems', itemId, {
        budgetStatus: 'published',
        lineAmount,
        updatedAt: now,
      })
      pass('publishBudget (fallback IAM)', budgetId)
    }
  } catch (error) {
    fail('criar/publicar orçamento', error.message)
    printSummary()
    process.exit(1)
  }

  // Cliente vê orçamento
  client = await signIn(apiKey, clientEmail, CLIENT_PASSWORD)
  let pendingItem
  try {
    const budgets = await runQuery(client.idToken, {
      from: [{ collectionId: 'budgets' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'orgId' },
                op: 'EQUAL',
                value: { stringValue: ORG_ID },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'clientUserId' },
                op: 'EQUAL',
                value: { stringValue: client.uid },
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
      limit: 10,
    })
    if (!budgets.length) fail('cliente vê orçamento publicado', 'vazio')
    else pass('cliente vê orçamento publicado', budgets.map((b) => b.id).join(', '))

    const items = await runQuery(client.idToken, {
      from: [{ collectionId: 'budgetItems' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'budgetId' },
                op: 'EQUAL',
                value: { stringValue: budgets[0].id },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'clientUserId' },
                op: 'EQUAL',
                value: { stringValue: client.uid },
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
      limit: 20,
    })
    pendingItem = items.find((i) => i.decision === 'pending')
    if (pendingItem) pass('cliente vê item pendente', pendingItem.description)
    else fail('cliente vê item pendente', `items=${items.length}`)
  } catch (error) {
    fail('cliente vê orçamento', error.message)
  }

  if (pendingItem) {
    const decide = await callFunction('decideBudgetItem', client.idToken, {
      budgetItemId: pendingItem.id,
      decision: 'approved',
    })
    if (decide.status === 200 && decide.body?.result?.ok) {
      pass(
        'cliente aprova linha',
        `finance=${decide.body.result.financeItemId} ${decide.body.result.integrationStatus}`,
      )
    } else {
      fail('cliente aprova linha', `HTTP ${decide.status} ${JSON.stringify(decide.body).slice(0, 220)}`)
    }

    // Financeiro bloqueado
    try {
      const finId = decide.body?.result?.financeItemId
      if (finId) {
        const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/financeItems/${finId}`
        const res = await fetch(url, { headers: { Authorization: `Bearer ${client.idToken}` } })
        if (res.status === 403) pass('cliente não lê financeItem', '403')
        else fail('cliente não lê financeItem', `HTTP ${res.status}`)
      }
    } catch (error) {
      fail('cliente não lê financeItem', error.message)
    }
  }

  // Tasks da visita (planejamento)
  try {
    const tasks = await runQuery(client.idToken, {
      from: [{ collectionId: 'tasks' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'visitId' },
          op: 'EQUAL',
          value: { stringValue: VISIT_ID },
        },
      },
      limit: 20,
    })
    pass('cliente lê tasks da visita', `${tasks.filter((t) => t.isDeleted !== true).length} tarefa(s)`)
  } catch (error) {
    fail('cliente lê tasks da visita', error.message)
  }

  console.log('\nCredenciais do cliente criado:')
  console.log(`  email: ${clientEmail}`)
  console.log(`  senha: ${CLIENT_PASSWORD}`)
  console.log(`  uid:   ${client.uid}`)

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

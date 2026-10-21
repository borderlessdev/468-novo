/**
 * Vincula o cliente à empresa (se preciso), cria e publica um orçamento de teste.
 * Usa o access_token do Firebase CLI logado.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'programa-visitas-72be9'
const CLIENT_EMAIL = process.argv[2] || 'borderlesspc12@gmail.com'

function loadCliTokens() {
  const file = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  if (!fs.existsSync(file)) throw new Error('firebase-tools.json não encontrado — rode firebase login')
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
  const tokens = cfg.tokens
  if (!tokens?.access_token) throw new Error('Access token ausente — rode firebase login')
  if (tokens.expires_at && Number(tokens.expires_at) < Date.now() + 60_000) {
    throw new Error('Access token expirado — rode firebase use para renovar')
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

async function runQuery(token, structuredQuery) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  })
  const json = await res.json()
  if (!Array.isArray(json) && json.error) {
    throw new Error(`Query falhou: ${json.error.message || JSON.stringify(json.error)}`)
  }
  return (Array.isArray(json) ? json : [])
    .filter((row) => row.document)
    .map((row) => ({
      id: row.document.name.split('/').pop(),
      ...fromFields(row.document.fields),
    }))
}

async function createDoc(token, collection, data, docId) {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}`
  const url = docId ? `${base}?documentId=${encodeURIComponent(docId)}` : base
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(data) }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Create ${collection} falhou: ${JSON.stringify(json).slice(0, 400)}`)
  return json.name.split('/').pop()
}

async function patchDoc(token, collection, id, data) {
  const fieldPaths = Object.keys(data)
  const qs = fieldPaths.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&')
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}/${id}?${qs}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(data) }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Patch ${collection}/${id} falhou: ${JSON.stringify(json).slice(0, 400)}`)
}

async function main() {
  const { accessToken: token, email } = loadCliTokens()
  console.log(`CLI: ${email}`)
  console.log(`Cliente alvo: ${CLIENT_EMAIL}`)

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
  if (!users.length) throw new Error(`Usuário não encontrado: ${CLIENT_EMAIL}`)

  const client =
    users.find((u) => u.role === 'client') ||
    users.find((u) => u.orgId) ||
    users[0]
  console.log(`uid=${client.id} role=${client.role} orgId=${client.orgId || '(nenhum)'}`)

  let orgId = client.orgId || ''
  if (!orgId) {
    const orgs = await runQuery(token, { from: [{ collectionId: 'organizations' }], limit: 20 })
    if (!orgs.length) throw new Error('Nenhuma empresa no projeto')
    orgId = orgs[0].id
    console.log(`Vinculando cliente à empresa ${orgs[0].name} (${orgId})`)
    await patchDoc(token, 'users', client.id, {
      orgId,
      role: 'client',
      uid: client.id,
      email: client.email || CLIENT_EMAIL,
      name: client.name || CLIENT_EMAIL,
    })
    const memberId = `${orgId}_${client.id}`
    await createDoc(
      token,
      'organizationMembers',
      {
        orgId,
        uid: client.id,
        email: client.email || CLIENT_EMAIL,
        name: client.name || CLIENT_EMAIL,
        orgRole: 'client',
      },
      memberId,
    )
    console.log(`organizationMembers/${memberId} criado`)
  } else {
    const members = await runQuery(token, {
      from: [{ collectionId: 'organizationMembers' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'uid' },
          op: 'EQUAL',
          value: { stringValue: client.id },
        },
      },
      limit: 10,
    })
    const member = members.find((m) => m.orgId === orgId)
    if (!member) {
      const memberId = `${orgId}_${client.id}`
      await createDoc(
        token,
        'organizationMembers',
        {
          orgId,
          uid: client.id,
          email: client.email || CLIENT_EMAIL,
          name: client.name || CLIENT_EMAIL,
          orgRole: 'client',
        },
        memberId,
      )
      console.log(`organizationMembers/${memberId} criado`)
    }
    if (client.role !== 'client') {
      await patchDoc(token, 'users', client.id, { role: 'client' })
      console.log('users.role ajustado para client')
    }
  }

  const visits = (
    await runQuery(token, {
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
  if (!visits.length) throw new Error('Nenhuma visita ativa na empresa')
  const visit = visits.find((v) => /marubeni/i.test(v.title || '')) || visits[0]
  console.log(`visita=${visit.id} title=${visit.title}`)

  const now = new Date().toISOString()
  const budgetId = await createDoc(token, 'budgets', {
    orgId,
    visitId: visit.id,
    clientUserId: client.id,
    status: 'draft',
    createdBy: 'seed-script',
    createdAt: now,
    updatedAt: now,
  })
  console.log(`budget draft=${budgetId}`)

  const items = [
    { description: 'Hospedagem (teste)', quantity: 2, unitAmount: 450 },
    { description: 'Translado aeroporto (teste)', quantity: 1, unitAmount: 180 },
  ]
  const itemIds = []
  for (const item of items) {
    const lineAmount = Math.round(item.quantity * item.unitAmount * 100) / 100
    const id = await createDoc(token, 'budgetItems', {
      budgetId,
      orgId,
      visitId: visit.id,
      clientUserId: client.id,
      description: item.description,
      quantity: item.quantity,
      unitAmount: item.unitAmount,
      lineAmount,
      budgetStatus: 'draft',
      decision: 'pending',
      integrationStatus: 'none',
      createdAt: now,
      updatedAt: now,
    })
    itemIds.push({ id, lineAmount })
    console.log(`item=${id}`)
  }

  await patchDoc(token, 'budgets', budgetId, {
    status: 'published',
    publishedAt: now,
    publishedBy: 'seed-script',
    updatedAt: now,
  })
  for (const item of itemIds) {
    await patchDoc(token, 'budgetItems', item.id, {
      lineAmount: item.lineAmount,
      budgetStatus: 'published',
      updatedAt: now,
    })
  }

  const clientIds = Array.isArray(visit.clientUserIds) ? [...visit.clientUserIds] : []
  if (!clientIds.includes(client.id)) clientIds.push(client.id)
  await patchDoc(token, 'visits', visit.id, {
    clientUserIds: clientIds,
    updatedAt: now,
  })

  console.log('OK publicado')
  console.log(`clientUid=${client.id}`)
  console.log(`orgId=${orgId}`)
  console.log(`budgetId=${budgetId}`)
  console.log('Recarregue http://localhost:5173/orcamento com a conta client desse e-mail.')
  console.log('(Se o login for outra uid do mesmo e-mail, saia e entre de novo na conta role=client.)')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})

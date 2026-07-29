/**
 * Atualiza role no Firestore (e admin claim se role=admin).
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/set-user-role.mjs <uid> <user|team|client|admin>
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const uid = process.argv[2]
const role = process.argv[3]

const VALID_ROLES = ['user', 'team', 'client', 'admin']

if (!uid || !role || !VALID_ROLES.includes(role)) {
  console.error('Uso: node scripts/set-user-role.mjs <uid> <user|team|client|admin>')
  process.exit(1)
}

const credPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  process.env.FIREBASE_SERVICE_ACCOUNT ||
  resolve(process.cwd(), 'service-account.json')

if (!existsSync(credPath)) {
  console.error(
    'Service account não encontrado. Defina GOOGLE_APPLICATION_CREDENTIALS ou coloque service-account.json na raiz.',
  )
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'))

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) })
}

const auth = getAuth()
const db = getFirestore()

try {
  if (role === 'admin') {
    await auth.setCustomUserClaims(uid, { admin: true })
  } else {
    await auth.setCustomUserClaims(uid, { admin: false })
  }

  await db.doc(`users/${uid}`).set(
    { role, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )

  console.log(`Role "${role}" definido para UID ${uid}`)
  if (role === 'admin') {
    console.log('Custom claim admin: true aplicado.')
  }
  console.log('Peça ao usuário fazer logout/login para renovar o token.')
  process.exit(0)
} catch (error) {
  console.error('Falha ao setar role:', error)
  process.exit(1)
}

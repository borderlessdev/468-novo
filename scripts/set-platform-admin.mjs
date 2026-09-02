/**
 * Define custom claims de platform admin (admin + platformAdmin).
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/set-platform-admin.mjs <uid>
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const uid = process.argv[2]
if (!uid) {
  console.error('Uso: node scripts/set-platform-admin.mjs <uid>')
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
  await auth.setCustomUserClaims(uid, { admin: true, platformAdmin: true })
  await db.doc(`users/${uid}`).set(
    { role: 'admin', updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
  console.log(`Platform admin claim definido para UID ${uid}`)
  console.log('Peça ao usuário fazer logout/login para renovar o token.')
  process.exit(0)
} catch (error) {
  console.error('Falha ao setar platform admin:', error)
  process.exit(1)
}

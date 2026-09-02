/**
 * Cria uma organização e opcionalmente vincula um admin da empresa.
 *
 * Uso:
 *   node scripts/create-organization.mjs "André" 10 <adminUid> <adminEmail> <adminName>
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const [name, maxUsersRaw, adminUid, adminEmail, adminName] = process.argv.slice(2)
if (!name || !maxUsersRaw) {
  console.error(
    'Uso: node scripts/create-organization.mjs "<nome>" <maxUsers> [adminUid] [adminEmail] [adminName]',
  )
  process.exit(1)
}

const maxUsers = Number(maxUsersRaw)
if (!Number.isFinite(maxUsers) || maxUsers < 1) {
  console.error('maxUsers inválido')
  process.exit(1)
}

const credPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  process.env.FIREBASE_SERVICE_ACCOUNT ||
  resolve(process.cwd(), 'service-account.json')

if (!existsSync(credPath)) {
  console.error('Service account não encontrado.')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'))
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) })
}

const db = getFirestore()

try {
  const orgRef = await db.collection('organizations').add({
    name,
    maxUsers,
    status: 'active',
    createdBy: 'script',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  console.log(`Organização criada: ${orgRef.id} (${name})`)

  if (adminUid && adminEmail && adminName) {
    const memberId = `${orgRef.id}_${adminUid}`
    await db.doc(`organizationMembers/${memberId}`).set({
      orgId: orgRef.id,
      uid: adminUid,
      email: adminEmail.trim().toLowerCase(),
      name: adminName,
      orgRole: 'org_admin',
      invitedBy: 'script',
      joinedAt: FieldValue.serverTimestamp(),
    })
    await db.doc(`users/${adminUid}`).set(
      { orgId: orgRef.id, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
    console.log(`Admin da empresa vinculado: ${adminEmail}`)
  }

  process.exit(0)
} catch (error) {
  console.error('Falha ao criar organização:', error)
  process.exit(1)
}

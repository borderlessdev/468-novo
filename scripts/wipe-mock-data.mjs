/**
 * Apaga dados mock do Firestore (mantém Auth).
 * Uso: node scripts/wipe-mock-data.mjs
 *
 * Por padrão limpa coleções operacionais e também organizations / members / invites.
 * Contas de login no Firebase Auth NÃO são removidas.
 *
 * Credenciais Master (override via env):
 *   WIPE_EMAIL / WIPE_PASSWORD
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  collection,
  getDocs,
  getFirestore,
  limit,
  query,
  writeBatch,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDfrFNQHOZfweb-V-O2sssoVQIwupVVgxc',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'programa-visitas-72be9.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'programa-visitas-72be9',
  storageBucket:
    process.env.VITE_FIREBASE_STORAGE_BUCKET || 'programa-visitas-72be9.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '112848844249',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:112848844249:web:1a8f5b0d8e6bec6bc315c8',
}

const EMAIL = process.env.WIPE_EMAIL || 'master@promover.experience'
const PASSWORD = process.env.WIPE_PASSWORD || 'Master@468!'

/** Coleções de conteúdo mock a limpar. */
const COLLECTIONS = [
  'visits',
  'visitors',
  'visitVisitors',
  'activities',
  'tasks',
  'financeItems',
  'revenueItems',
  'documents',
  'documentPlaceholders',
  'invites',
  'notifications',
  'activityLogs',
  'emailLogs',
  'mail',
  'playbooks',
  'visitGuestLinks',
  'visitFeedbacks',
  'guestDrafts',
  'calendarConnections',
  'organizations',
  'organizationMembers',
]

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

async function deleteCollection(name) {
  let total = 0
  for (;;) {
    const snap = await getDocs(query(collection(db, name), limit(400)))
    if (snap.empty) break
    const batch = writeBatch(db)
    for (const docSnap of snap.docs) {
      batch.delete(docSnap.ref)
    }
    await batch.commit()
    total += snap.size
    console.log(`  ${name}: +${snap.size} (total ${total})`)
  }
  return total
}

async function main() {
  console.log(`Login como ${EMAIL}…`)
  await signInWithEmailAndPassword(auth, EMAIL, PASSWORD)
  console.log('Limpando coleções mock…')

  const results = []
  for (const name of COLLECTIONS) {
    try {
      const count = await deleteCollection(name)
      results.push({ name, count, ok: true })
    } catch (error) {
      console.error(`  FALHA ${name}:`, error?.message || error)
      results.push({ name, count: 0, ok: false, error: String(error?.message || error) })
    }
  }

  console.log('\nResumo:')
  for (const row of results) {
    console.log(
      `  ${row.ok ? 'OK' : 'ERR'} ${row.name}: ${row.count} doc(s)${row.error ? ` — ${row.error}` : ''}`,
    )
  }
  console.log('\nAuth users preservados. Organizations/invites limpos — recrie pastas pelo Master.')
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

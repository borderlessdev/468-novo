/**
 * Debug which VisitDetailPage queries fail for a given visit.
 * Usage: node scripts/debug-visit-load.mjs [visitId]
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyCA-HlVUO68fozpAFSLz3XPM7OhM4Me1A8',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'borderless-e4a6a.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'borderless-e4a6a',
  storageBucket:
    process.env.VITE_FIREBASE_STORAGE_BUCKET || 'borderless-e4a6a.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '774098896837',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:774098896837:web:6805173af4fb817246edac',
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

function isPermissionDenied(error) {
  return error?.code === 'permission-denied'
}

async function queryVisitChildren(name, colName, visitId, uid, isAdmin) {
  try {
    const snap = await getDocs(
      query(collection(db, colName), where('visitId', '==', visitId)),
    )
    console.log(`OK  ${name} visitId-only (${snap.size} docs)`)
    return true
  } catch (error) {
    if (!isPermissionDenied(error) || isAdmin) {
      console.error(`FAIL ${name} visitId-only`)
      console.error(`     code: ${error?.code}`)
      console.error(`     message: ${error?.message}`)
      return false
    }
    try {
      const snap = await getDocs(
        query(
          collection(db, colName),
          where('ownerId', '==', uid),
          where('visitId', '==', visitId),
        ),
      )
      console.log(`OK  ${name} ownerId+visitId fallback (${snap.size} docs)`)
      return true
    } catch (fallbackError) {
      console.error(`FAIL ${name} ownerId+visitId fallback`)
      console.error(`     code: ${fallbackError?.code}`)
      console.error(`     message: ${fallbackError?.message}`)
      return false
    }
  }
}

async function tryQuery(name, fn) {
  try {
    const result = await fn()
    const count = Array.isArray(result) ? result.length : result?.size ?? 1
    console.log(`OK  ${name} (${count} docs)`)
    return true
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(`     code: ${error?.code}`)
    console.error(`     message: ${error?.message}`)
    return false
  }
}

async function main() {
  const email = process.env.DEBUG_EMAIL || 'operador@promover.experience'
  const password = process.env.DEBUG_PASSWORD || 'Demo@123456'

  const credential = await signInWithEmailAndPassword(auth, email, password)
  const uid = credential.user.uid
  const token = await credential.user.getIdTokenResult()
  const isAdmin = token.claims.admin === true
  console.log(`Signed in as ${email} (${uid}), admin=${isAdmin}`)

  let visitId = process.argv[2]
  if (!visitId) {
    const visitsSnap = await getDocs(
      query(
        collection(db, 'visits'),
        where('ownerId', '==', uid),
        orderBy('startDate', 'desc'),
      ),
    )
    if (visitsSnap.empty) {
      console.error('No visits found for this user. Pass visitId as argument.')
      process.exit(1)
    }
    visitId = visitsSnap.docs[0].id
  }

  const visitSnap = await getDoc(doc(db, 'visits', visitId))
  if (!visitSnap.exists()) {
    console.error(`Visit ${visitId} not found`)
    process.exit(1)
  }
  console.log(`Testing visit ${visitId}: ${visitSnap.data().title}\n`)

  await queryVisitChildren('listVisitVisitors', 'visitVisitors', visitId, uid, isAdmin)

  await tryQuery('listVisitors', () =>
    getDocs(query(collection(db, 'visitors'), where('ownerId', '==', uid))),
  )

  await queryVisitChildren('listTasks', 'tasks', visitId, uid, isAdmin)
  await queryVisitChildren('listFinanceItems', 'financeItems', visitId, uid, isAdmin)
  await queryVisitChildren('listDocuments', 'documents', visitId, uid, isAdmin)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

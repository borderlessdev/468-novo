/**
 * Cria usuário Auth + perfil e promove a platform admin (admin + platformAdmin).
 * Preferência: service-account.json. Fallback: access_token do Firebase CLI (firebase login).
 *
 * Uso:
 *   node scripts/create-master-admin.mjs [email] [senha] [nome]
 */
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { initializeApp as initAdmin, cert, getApps } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import { doc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDfrFNQHOZfweb-V-O2sssoVQIwupVVgxc',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'programa-visitas-72be9.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'programa-visitas-72be9',
  storageBucket:
    process.env.VITE_FIREBASE_STORAGE_BUCKET || 'programa-visitas-72be9.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '112848844249',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:112848844249:web:1a8f5b0d8e6bec6bc315c8',
}

const email = (process.argv[2] || 'master@promover.experience').trim().toLowerCase()
const password = process.argv[3] || 'Master@468!'
const name = process.argv[4] || 'Admin Master'

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

function serviceAccountPath() {
  return (
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    resolve(process.cwd(), 'service-account.json')
  )
}

function loadCliTokens() {
  const candidates = [
    resolve(homedir(), '.config/configstore/firebase-tools.json'),
    resolve(process.env.APPDATA || '', 'configstore/firebase-tools.json'),
  ]
  for (const path of candidates) {
    if (!existsSync(path)) continue
    const data = JSON.parse(readFileSync(path, 'utf8'))
    if (data?.tokens?.access_token) return data.tokens
  }
  return null
}

async function setClaimsWithAdminSdk(uid) {
  const credPath = serviceAccountPath()
  if (!existsSync(credPath)) return false
  const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'))
  if (!getApps().length) {
    initAdmin({ credential: cert(serviceAccount) })
  }
  await getAdminAuth().setCustomUserClaims(uid, { admin: true, platformAdmin: true })
  await getAdminFirestore().doc(`users/${uid}`).set(
    { role: 'admin', updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
  return true
}

async function setClaimsWithCliToken(uid) {
  const tokens = loadCliTokens()
  if (!tokens?.access_token) {
    throw new Error('Sem access_token do Firebase CLI. Rode: firebase login')
  }
  if (tokens.expires_at && Date.now() > Number(tokens.expires_at)) {
    throw new Error(
      'Token do Firebase CLI expirado. Rode: firebase login  (ou coloque service-account.json na raiz)',
    )
  }

  const projectId = firebaseConfig.projectId
  const url = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      localId: uid,
      customAttributes: JSON.stringify({ admin: true, platformAdmin: true }),
    }),
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error?.message || JSON.stringify(json))
  }
}

async function ensureUser() {
  let credential
  try {
    credential = await createUserWithEmailAndPassword(auth, email, password)
    console.log(`Conta criada: ${email}`)
  } catch (error) {
    if (error?.code === 'auth/email-already-in-use') {
      credential = await signInWithEmailAndPassword(auth, email, password)
      console.log(`Conta já existia — login ok: ${email}`)
    } else {
      throw error
    }
  }

  await updateProfile(credential.user, { displayName: name })

  const uid = credential.user.uid
  await setDoc(
    doc(db, 'users', uid),
    {
      uid,
      name,
      email,
      photoURL: null,
      role: 'user',
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  )
  console.log('Perfil Firestore ok')

  return uid
}

try {
  const uid = await ensureUser()
  console.log(`UID: ${uid}`)

  const viaSa = await setClaimsWithAdminSdk(uid)
  if (viaSa) {
    console.log('Claims definidos via service-account.json')
  } else {
    await setClaimsWithCliToken(uid)
    console.log('Claims definidos via Firebase CLI')
  }

  console.log('')
  console.log('=== LOGIN MASTER ===')
  console.log(`E-mail: ${email}`)
  console.log(`Senha:  ${password}`)
  console.log(`Nome:   ${name}`)
  console.log(`UID:    ${uid}`)
  console.log('Abra /empresas após o login para criar as pastas dos clientes.')
  process.exit(0)
} catch (error) {
  console.error('Falha:', error instanceof Error ? error.message : error)
  process.exit(1)
}

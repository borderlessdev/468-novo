/**
 * Seed de conta de teste no Firebase Auth + perfil Firestore.
 * Uso: node scripts/seed-test-user.mjs
 */
import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyCA-HlVUO68fozpAFSLz3XPM7OhM4Me1A8',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'borderless-e4a6a.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'borderless-e4a6a',
  storageBucket:
    process.env.VITE_FIREBASE_STORAGE_BUCKET || 'borderless-e4a6a.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '774098896837',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:774098896837:web:6805173af4fb817246edac',
}

const TEST_USER = {
  name: 'Usuário Demo',
  email: 'demo@promover.experience',
  password: 'Demo@123456',
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

async function ensureUser() {
  let credential
  try {
    credential = await createUserWithEmailAndPassword(
      auth,
      TEST_USER.email,
      TEST_USER.password,
    )
    console.log('Conta criada no Auth:', credential.user.uid)
  } catch (error) {
    if (error?.code === 'auth/email-already-in-use') {
      credential = await signInWithEmailAndPassword(
        auth,
        TEST_USER.email,
        TEST_USER.password,
      )
      console.log('Conta já existia — login ok:', credential.user.uid)
    } else {
      throw error
    }
  }

  await updateProfile(credential.user, { displayName: TEST_USER.name })

  const userRef = doc(db, 'users', credential.user.uid)
  const existing = await getDoc(userRef)
  if (!existing.exists()) {
    await setDoc(userRef, {
      uid: credential.user.uid,
      name: TEST_USER.name,
      email: TEST_USER.email,
      photoURL: null,
      role: 'user',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    console.log('Perfil Firestore criado em users/' + credential.user.uid)
  } else {
    console.log('Perfil Firestore já existia')
  }

  return credential.user.uid
}

function writeCredentials(uid) {
  const content = `# Credenciais de teste — Promover Experience

> Conta seed para acesso local/homologação. **Não use em produção.**

| Campo | Valor |
|-------|-------|
| Nome | ${TEST_USER.name} |
| E-mail | \`${TEST_USER.email}\` |
| Senha | \`${TEST_USER.password}\` |
| Papel | \`user\` |
| UID | \`${uid}\` |
| Projeto Firebase | \`borderless-e4a6a\` |

## Como entrar

1. Suba o app: \`npm run dev\`
2. Abra \`http://localhost:5173/login\`
3. Use o e-mail e a senha acima

## Regenerar seed

\`\`\`bash
node scripts/seed-test-user.mjs
\`\`\`
`

  const out = resolve(process.cwd(), 'credenciais.md')
  writeFileSync(out, content, 'utf8')
  console.log('Arquivo salvo em:', out)
}

try {
  const uid = await ensureUser()
  writeCredentials(uid)
  process.exit(0)
} catch (error) {
  console.error('Falha no seed:', error)
  process.exit(1)
}

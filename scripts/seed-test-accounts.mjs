/**
 * Cria contas de teste: operador (user), equipe (team) e cliente (client).
 * Uso: node scripts/seed-test-accounts.mjs
 *
 * Admin claim exige Admin SDK — rode scripts/set-admin-claim.mjs com service account.
 */
import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore'
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

const ACCOUNTS = [
  {
    name: 'Operador Demo',
    email: 'operador@promover.experience',
    password: 'Demo@123456',
    role: 'user',
  },
  {
    name: 'Equipe Demo',
    email: 'equipe@promover.experience',
    password: 'Demo@123456',
    role: 'team',
  },
  {
    name: 'Cliente Demo',
    email: 'cliente@promover.experience',
    password: 'Demo@123456',
    role: 'client',
  },
]

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

async function ensureAccount(account) {
  let credential
  try {
    credential = await createUserWithEmailAndPassword(auth, account.email, account.password)
    console.log(`Conta criada: ${account.email} (${credential.user.uid})`)
  } catch (error) {
    if (error?.code === 'auth/email-already-in-use') {
      credential = await signInWithEmailAndPassword(auth, account.email, account.password)
      console.log(`Conta já existia: ${account.email} (${credential.user.uid})`)
    } else {
      throw error
    }
  }

  await updateProfile(credential.user, { displayName: account.name })

  const userRef = doc(db, 'users', credential.user.uid)
  const existing = await getDoc(userRef)
  // Rules só permitem role 'user' na criação pelo cliente — perfis team/client exigem Admin SDK.
  const firestoreRole = existing.exists() ? account.role : 'user'
  const payload = {
    uid: credential.user.uid,
    name: account.name,
    email: account.email,
    photoURL: null,
    role: firestoreRole,
    updatedAt: serverTimestamp(),
  }

  if (!existing.exists()) {
    await setDoc(userRef, { ...payload, createdAt: serverTimestamp() })
    console.log(`Perfil Firestore criado (role inicial: user)`)
  } else if (existing.data()?.role === 'user' && account.role !== 'user') {
    // Não tenta elevar role sem Admin SDK — evita PERMISSION_DENIED
    console.log(`Perfil já existe como user — use set-user-role.mjs para ${account.role}`)
  } else {
    await setDoc(userRef, payload, { merge: true })
    console.log(`Perfil Firestore atualizado (role: ${firestoreRole})`)
  }

  return { ...account, uid: credential.user.uid, needsRoleFix: !existing.exists() && account.role !== 'user' }
}

function writeCredentials(accounts) {
  const rows = accounts
    .map(
      (a) =>
        `| ${a.name} | \`${a.email}\` | \`${a.password}\` | \`${a.role}\` | \`${a.uid}\` |`,
    )
    .join('\n')

  const roleFixes = accounts
    .filter((a) => a.role !== 'user')
    .map((a) => `node scripts/set-user-role.mjs ${a.uid} ${a.role}`)
    .join('\n')

  const content = `# Contas de teste — Promover Experience

> Contas seed para homologação. **Não use em produção.**

| Nome | E-mail | Senha | Papel desejado | UID |
|------|--------|-------|----------------|-----|
${rows}

Projeto Firebase: \`borderless-e4a6a\`

## Ajustar perfis equipe/cliente/admin

As Firestore rules só permitem \`role: user\` na criação pelo app. Com service account:

\`\`\`bash
${roleFixes || '# nenhum ajuste necessário'}
node scripts/set-user-role.mjs <uid> admin   # se quiser admin
\`\`\`

## Como usar

1. \`npm run dev\` e faça login com uma das contas acima.
2. Para **equipe/cliente** acessarem uma visita, inclua o UID em **Equipe** ou **Clientes** no detalhe da visita.

## Regenerar

\`\`\`bash
npm run seed:accounts
\`\`\`
`

  const out = resolve(process.cwd(), 'credenciais.md')
  writeFileSync(out, content, 'utf8')
  console.log('Arquivo salvo em:', out)
}

try {
  const created = []
  for (const account of ACCOUNTS) {
    created.push(await ensureAccount(account))
  }
  writeCredentials(created)
  process.exit(0)
} catch (error) {
  console.error('Falha no seed:', error)
  process.exit(1)
}

import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  addOrganizationMember,
  canAddOrganizationMember,
  listOrganizationMembers,
} from '@/services/organizations'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const SECONDARY_APP_NAME = 'OrgAdminSecondary'

export type CreatedOrgAdminCredentials = {
  uid: string
  name: string
  email: string
  password: string
}

function generateTempPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%'
  const all = upper + lower + digits + symbols
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)]!
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)]
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () =>
    pick(all),
  )
  return [...required, ...rest].sort(() => Math.random() - 0.5).join('')
}

async function withSecondaryAuth<T>(
  run: (secondaryApp: FirebaseApp) => Promise<T>,
): Promise<T> {
  const existing = getApps().find((item) => item.name === SECONDARY_APP_NAME)
  if (existing) {
    try {
      await deleteApp(existing)
    } catch {
      // ignore
    }
  }
  const secondaryApp = initializeApp(firebaseConfig, SECONDARY_APP_NAME)
  try {
    return await run(secondaryApp)
  } finally {
    try {
      await signOut(getAuth(secondaryApp))
    } catch {
      // ignore
    }
    try {
      await deleteApp(secondaryApp)
    } catch {
      // ignore
    }
  }
}

/**
 * Cria o 1º login Admin da empresa sem deslogar o Master (Auth secondary app).
 */
export async function createOrganizationAdmin(input: {
  orgId: string
  name: string
  email: string
  password?: string
  createdBy: string
}): Promise<CreatedOrgAdminCredentials> {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  if (!name || name.length < 2) {
    throw new Error('Informe o nome do administrador.')
  }
  if (!email || !email.includes('@')) {
    throw new Error('Informe um e-mail válido.')
  }

  const canAdd = await canAddOrganizationMember(input.orgId)
  if (!canAdd) {
    throw new Error('Limite de acessos da empresa atingido.')
  }

  const members = await listOrganizationMembers(input.orgId)
  if (members.some((member) => member.orgRole === 'org_admin')) {
    throw new Error('Esta empresa já possui um administrador.')
  }

  const password =
    input.password?.trim() && input.password.trim().length >= 8
      ? input.password.trim()
      : generateTempPassword()

  const uid = await withSecondaryAuth(async (secondaryApp) => {
    const secondaryAuth = getAuth(secondaryApp)
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password,
    )
    await updateProfile(credential.user, { displayName: name })
    return credential.user.uid
  })

  await setDoc(doc(db, 'users', uid), {
    uid,
    name,
    email,
    photoURL: null,
    role: 'user',
    orgId: input.orgId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await addOrganizationMember({
    orgId: input.orgId,
    uid,
    email,
    name,
    orgRole: 'org_admin',
    invitedBy: input.createdBy,
  })

  return { uid, name, email, password }
}

export { generateTempPassword }

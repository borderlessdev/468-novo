import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { UserProfile, UserRole } from '@/types'

const usersCol = collection(db, 'users')

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(usersCol, uid))
  if (!snap.exists()) return null
  return snap.data() as UserProfile
}

export async function createUserProfile(input: {
  uid: string
  name: string
  email: string
  photoURL?: string
  role?: UserRole
}): Promise<void> {
  await setDoc(doc(usersCol, input.uid), {
    uid: input.uid,
    name: input.name,
    email: input.email,
    photoURL: input.photoURL ?? null,
    role: input.role ?? 'user',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateUserProfile(
  uid: string,
  data: Partial<Pick<UserProfile, 'name' | 'photoURL'>>,
): Promise<void> {
  await updateDoc(doc(usersCol, uid), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

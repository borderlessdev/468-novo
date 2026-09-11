import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  mergeNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/notificationPreferences'
import { mergeModulePermissions } from '@/lib/access'
import type { ModulePermissions, UserProfile, UserRole } from '@/types'

const usersCol = collection(db, 'users')

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(usersCol, uid))
  if (!snap.exists()) return null
  return snap.data() as UserProfile
}

export async function getUsersByIds(uids: string[]): Promise<UserProfile[]> {
  const unique = [...new Set(uids.filter(Boolean))]
  const results = await Promise.all(unique.map((uid) => getUserProfile(uid)))
  return results.filter((u): u is UserProfile => u != null)
}

export async function listUsers(isAdmin: boolean): Promise<UserProfile[]> {
  if (!isAdmin) return []
  const snap = await getDocs(usersCol)
  return snap.docs.map((d) => d.data() as UserProfile)
}

export async function createUserProfile(input: {
  uid: string
  name: string
  email: string
  photoURL?: string
  role?: UserRole
  orgId?: string
}): Promise<void> {
  const ref = doc(usersCol, input.uid)
  const existing = await getDoc(ref)
  const payload: Record<string, unknown> = {
    uid: input.uid,
    name: input.name,
    email: input.email,
    photoURL: input.photoURL ?? null,
    role: input.role ?? existing.data()?.role ?? 'user',
    updatedAt: serverTimestamp(),
  }
  // Só grava orgId quando informado — evita corrida do onAuthStateChanged
  // apagar o vínculo criado pelo fluxo de convite.
  if (input.orgId !== undefined) {
    payload.orgId = input.orgId || null
  } else if (!existing.exists()) {
    payload.orgId = null
  }
  if (!existing.exists()) {
    payload.modulePermissions = mergeModulePermissions(null)
    payload.createdAt = serverTimestamp()
  }
  await setDoc(ref, payload, { merge: true })
}

export async function updateUserProfile(
  uid: string,
  data: Partial<
    Pick<
      UserProfile,
      | 'name'
      | 'photoURL'
      | 'photoStoragePath'
      | 'notificationPreferences'
      | 'modulePermissions'
      | 'role'
      | 'orgId'
    >
  >,
): Promise<void> {
  await updateDoc(doc(usersCol, uid), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function updateUserModulePermissions(
  uid: string,
  modulePermissions: ModulePermissions,
): Promise<void> {
  await updateUserProfile(uid, { modulePermissions })
}

export async function getUserNotificationPreferences(
  uid: string,
): Promise<NotificationPreferences> {
  const profile = await getUserProfile(uid)
  return mergeNotificationPreferences(profile?.notificationPreferences)
}

export async function updateUserNotificationPreferences(
  uid: string,
  preferences: NotificationPreferences,
): Promise<void> {
  await updateUserProfile(uid, { notificationPreferences: preferences })
}

export async function findUserByEmail(email: string): Promise<UserProfile | null> {
  const snap = await getDocs(
    query(usersCol, where('email', '==', email.trim().toLowerCase())),
  )
  if (snap.empty) return null
  return snap.docs[0].data() as UserProfile
}

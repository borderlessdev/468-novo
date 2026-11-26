import {
  collection,
  deleteDoc,
  deleteField,
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
import { getTrashExpiresAt } from '@/lib/trash'
import type { ModulePermissions, UserProfile, UserRole } from '@/types'

const usersCol = collection(db, 'users')

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(usersCol, uid))
  if (!snap.exists()) return null
  return mapUserProfile(snap.data() as Record<string, unknown>)
}

export async function getUsersByIds(uids: string[]): Promise<UserProfile[]> {
  const unique = [...new Set(uids.filter(Boolean))]
  const results = await Promise.all(unique.map((uid) => getUserProfile(uid)))
  return results.filter((u): u is UserProfile => u != null)
}

function mapUserProfile(data: Record<string, unknown>): UserProfile {
  return {
    ...(data as UserProfile),
    isDeleted: data.isDeleted === true,
    deletedAt: data.deletedAt,
    deletedBy: data.deletedBy ? String(data.deletedBy) : undefined,
    expiresAt: data.expiresAt,
  }
}

export async function listUsers(isAdmin: boolean): Promise<UserProfile[]> {
  if (!isAdmin) return []
  const snap = await getDocs(usersCol)
  return snap.docs
    .map((d) => mapUserProfile(d.data()))
    .filter((user) => !user.isDeleted)
}

export async function listDeletedUsers(isAdmin: boolean): Promise<UserProfile[]> {
  if (!isAdmin) return []
  const snap = await getDocs(usersCol)
  return snap.docs
    .map((d) => mapUserProfile(d.data()))
    .filter((user) => user.isDeleted === true)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function softDeleteUser(uid: string, deletedBy: string): Promise<void> {
  const profile = await getUserProfile(uid)
  if (!profile) throw new Error('Usuário não encontrado')
  if (profile.isDeleted) return
  await updateDoc(doc(usersCol, uid), {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy,
    expiresAt: getTrashExpiresAt(),
    updatedAt: serverTimestamp(),
  })
}

export async function restoreUser(uid: string): Promise<void> {
  const profile = await getUserProfile(uid)
  if (!profile) throw new Error('Usuário não encontrado')
  if (!profile.isDeleted) return
  await updateDoc(doc(usersCol, uid), {
    isDeleted: false,
    deletedAt: deleteField(),
    deletedBy: deleteField(),
    expiresAt: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

/** Remove o documento do perfil. Não apaga a conta Auth. */
export async function permanentDeleteUserProfile(uid: string): Promise<void> {
  await deleteDoc(doc(usersCol, uid))
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
  // apagar o vínculo criado pelo fluxo de convite. Não força null em perfil novo
  // (rules + merge preservam vínculo se o register gravar orgId em paralelo).
  if (input.orgId !== undefined) {
    payload.orgId = input.orgId || null
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
      | 'emailNotificationPreferences'
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

export async function getUserEmailNotificationPreferences(
  uid: string,
): Promise<NotificationPreferences> {
  const profile = await getUserProfile(uid)
  return mergeNotificationPreferences(profile?.emailNotificationPreferences)
}

export async function updateUserEmailNotificationPreferences(
  uid: string,
  preferences: NotificationPreferences,
): Promise<void> {
  await updateUserProfile(uid, { emailNotificationPreferences: preferences })
}

export async function findUserByEmail(email: string): Promise<UserProfile | null> {
  const snap = await getDocs(
    query(usersCol, where('email', '==', email.trim().toLowerCase())),
  )
  if (snap.empty) return null
  return snap.docs[0].data() as UserProfile
}

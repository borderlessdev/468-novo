import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { organizationMemberId } from '@/lib/org'
import { isCargoRegion, isEmployeeCargo } from '@/lib/cargo'
import { getTrashExpiresAt } from '@/lib/trash'
import type { InviteRole, Organization, OrganizationMember, OrgRole } from '@/types'

const organizationsCol = collection(db, 'organizations')
const membersCol = collection(db, 'organizationMembers')

function mapOrganization(id: string, data: Record<string, unknown>): Organization {
  return {
    id,
    name: String(data.name ?? ''),
    maxUsers: Number(data.maxUsers ?? 10),
    status: data.status === 'suspended' ? 'suspended' : 'active',
    createdBy: String(data.createdBy ?? ''),
    logoUrl: data.logoUrl ? String(data.logoUrl) : undefined,
    logoStoragePath: data.logoStoragePath ? String(data.logoStoragePath) : undefined,
    dashboardVariant: data.dashboardVariant === 'vale' ? 'vale' : 'default',
    isDeleted: data.isDeleted === true,
    deletedAt: data.deletedAt,
    deletedBy: data.deletedBy ? String(data.deletedBy) : undefined,
    expiresAt: data.expiresAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

function mapMember(id: string, data: Record<string, unknown>): OrganizationMember {
  const cargo = isEmployeeCargo(data.cargo) ? data.cargo : undefined
  return {
    id,
    orgId: String(data.orgId ?? ''),
    uid: String(data.uid ?? ''),
    email: String(data.email ?? ''),
    name: String(data.name ?? ''),
    orgRole: (data.orgRole as OrgRole) ?? 'user',
    cargo,
    cargoRegion:
      cargo === 'analista' && isCargoRegion(data.cargoRegion) ? data.cargoRegion : undefined,
    department: data.department ? String(data.department) : undefined,
    invitedBy: data.invitedBy ? String(data.invitedBy) : undefined,
    joinedAt: data.joinedAt,
  }
}

export async function listOrganizations(): Promise<Organization[]> {
  const snap = await getDocs(query(organizationsCol))
  return snap.docs
    .map((item) => mapOrganization(item.id, item.data()))
    .filter((org) => !org.isDeleted)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const snap = await getDoc(doc(organizationsCol, orgId))
  if (!snap.exists()) return null
  return mapOrganization(snap.id, snap.data())
}

export async function createOrganization(input: {
  name: string
  maxUsers: number
  createdBy: string
}): Promise<string> {
  const ref = await addDoc(organizationsCol, {
    name: input.name.trim(),
    maxUsers: input.maxUsers,
    status: 'active',
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getOrganizationMember(
  orgId: string,
  uid: string,
): Promise<OrganizationMember | null> {
  const snap = await getDoc(doc(membersCol, organizationMemberId(orgId, uid)))
  if (!snap.exists()) return null
  return mapMember(snap.id, snap.data())
}

export async function getMemberByUid(uid: string): Promise<OrganizationMember | null> {
  const snap = await getDocs(query(membersCol, where('uid', '==', uid)))
  if (snap.empty) return null
  return mapMember(snap.docs[0].id, snap.docs[0].data())
}

export async function listOrganizationMembers(orgId: string): Promise<OrganizationMember[]> {
  const snap = await getDocs(query(membersCol, where('orgId', '==', orgId)))
  return snap.docs
    .map((item) => mapMember(item.id, item.data()))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/** Todos os admins de empresa (todas as pastas). Uso do console Master. */
export async function listOrganizationAdmins(): Promise<OrganizationMember[]> {
  const snap = await getDocs(query(membersCol, where('orgRole', '==', 'org_admin')))
  return snap.docs
    .map((item) => mapMember(item.id, item.data()))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export function subscribeOrganizationMembers(
  orgId: string,
  onChange: (members: OrganizationMember[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(membersCol, where('orgId', '==', orgId)),
    (snap) => {
      onChange(
        snap.docs
          .map((item) => mapMember(item.id, item.data()))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      )
    },
    onError,
  )
}

export async function countOrganizationSeats(orgId: string): Promise<number> {
  const snap = await getDocs(query(membersCol, where('orgId', '==', orgId)))
  return snap.size
}

export async function countPendingInvites(orgId: string): Promise<number> {
  const snap = await getDocs(
    query(
      collection(db, 'invites'),
      where('orgId', '==', orgId),
      where('status', '==', 'pending'),
    ),
  )
  return snap.size
}

export async function countPendingInvitesByRole(orgId: string, role: InviteRole): Promise<number> {
  const snap = await getDocs(
    query(
      collection(db, 'invites'),
      where('orgId', '==', orgId),
      where('status', '==', 'pending'),
      where('role', '==', role),
    ),
  )
  return snap.size
}

/** Membros + convites pendentes (com fallback se a query composta falhar). */
export async function getOrganizationSeatUsage(orgId: string): Promise<{
  seats: number
  pending: number
}> {
  let seats = 0
  let pending = 0
  try {
    seats = await countOrganizationSeats(orgId)
  } catch (error) {
    console.error('Falha ao contar membros da pasta', orgId, error)
  }
  try {
    pending = await countPendingInvites(orgId)
  } catch {
    try {
      pending = await countPendingInvitesByRole(orgId, 'client')
    } catch (error) {
      console.error('Falha ao contar convites pendentes', orgId, error)
    }
  }
  return { seats, pending }
}

export async function canAddOrganizationMember(orgId: string): Promise<boolean> {
  const org = await getOrganization(orgId)
  if (!org || org.status !== 'active') return false
  const { seats, pending } = await getOrganizationSeatUsage(orgId)
  return seats + pending < org.maxUsers
}

export async function addOrganizationMember(input: {
  orgId: string
  uid: string
  email: string
  name: string
  orgRole: OrgRole
  department?: string
  invitedBy?: string
}): Promise<void> {
  await setDoc(doc(membersCol, organizationMemberId(input.orgId, input.uid)), {
    orgId: input.orgId,
    uid: input.uid,
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    orgRole: input.orgRole,
    department: input.department?.trim() || null,
    invitedBy: input.invitedBy ?? null,
    joinedAt: serverTimestamp(),
  })
}

export async function createOrganizationWithAdmin(input: {
  name: string
  maxUsers: number
  createdBy: string
  adminUid: string
  adminEmail: string
  adminName: string
}): Promise<string> {
  const orgId = await createOrganization({
    name: input.name,
    maxUsers: input.maxUsers,
    createdBy: input.createdBy,
  })
  await addOrganizationMember({
    orgId,
    uid: input.adminUid,
    email: input.adminEmail,
    name: input.adminName,
    orgRole: 'org_admin',
    invitedBy: input.createdBy,
  })
  return orgId
}

export function mapInviteRoleToOrgRole(role: InviteRole): OrgRole {
  if (role === 'org_admin') return 'org_admin'
  if (role === 'team') return 'team'
  if (role === 'client') return 'client'
  return 'user'
}

export async function updateOrganization(
  orgId: string,
  data: Partial<
    Pick<
      Organization,
      'name' | 'maxUsers' | 'status' | 'logoUrl' | 'logoStoragePath' | 'dashboardVariant'
    >
  >,
): Promise<void> {
  await updateDoc(doc(organizationsCol, orgId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

/** Remove o vínculo do membro com a pasta. Não apaga a conta Auth. */
export async function removeOrganizationMember(
  orgId: string,
  uid: string,
): Promise<void> {
  await deleteDoc(doc(membersCol, organizationMemberId(orgId, uid)))

  const userRef = doc(db, 'users', uid)
  const userSnap = await getDoc(userRef)
  if (!userSnap.exists()) return
  const data = userSnap.data()
  if (data.orgId === orgId) {
    await updateDoc(userRef, {
      orgId: deleteField(),
      updatedAt: serverTimestamp(),
    })
  }
}

export async function updateOrganizationMember(
  orgId: string,
  uid: string,
  data: Partial<Pick<OrganizationMember, 'name' | 'orgRole'>>,
): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (data.name !== undefined) payload.name = data.name.trim()
  if (data.orgRole !== undefined) payload.orgRole = data.orgRole
  if (Object.keys(payload).length === 0) return
  await updateDoc(doc(membersCol, organizationMemberId(orgId, uid)), payload)
}

/**
 * Move o vínculo de uma pasta para outra. Não apaga a conta Auth.
 * Libera a vaga na origem e ocupa na destino.
 */
export async function moveOrganizationMember(input: {
  fromOrgId: string
  toOrgId: string
  uid: string
  email: string
  name: string
  orgRole: OrgRole
}): Promise<void> {
  if (input.fromOrgId === input.toOrgId) return

  const target = await getOrganization(input.toOrgId)
  if (!target || target.isDeleted || target.status !== 'active') {
    throw new Error('Pasta de destino indisponível')
  }

  const existing = await getOrganizationMember(input.toOrgId, input.uid)
  if (existing) {
    throw new Error('Esta pessoa já tem acesso à pasta de destino')
  }

  const canAdd = await canAddOrganizationMember(input.toOrgId)
  if (!canAdd) {
    throw new Error('A pasta de destino está sem vagas')
  }

  await removeOrganizationMember(input.fromOrgId, input.uid)
  await addOrganizationMember({
    orgId: input.toOrgId,
    uid: input.uid,
    email: input.email,
    name: input.name,
    orgRole: input.orgRole,
  })

  await updateDoc(doc(db, 'users', input.uid), {
    orgId: input.toOrgId,
    name: input.name.trim(),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Move a pasta para a lixeira (soft delete). Convites pendentes são cancelados.
 * Membros e dados operacionais permanecem para eventual restauração.
 */
export async function softDeleteOrganization(
  orgId: string,
  deletedBy: string,
): Promise<void> {
  const org = await getOrganization(orgId)
  if (!org) {
    throw new Error('Cliente não encontrado')
  }
  if (org.isDeleted) return

  const inviteSnap = await getDocs(
    query(collection(db, 'invites'), where('orgId', '==', orgId)),
  )
  await Promise.all(inviteSnap.docs.map((inviteDoc) => deleteDoc(inviteDoc.ref)))

  await updateDoc(doc(organizationsCol, orgId), {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy,
    expiresAt: getTrashExpiresAt(),
    status: 'suspended',
    updatedAt: serverTimestamp(),
  })
}

export async function listDeletedOrganizations(): Promise<Organization[]> {
  const snap = await getDocs(query(organizationsCol))
  return snap.docs
    .map((item) => mapOrganization(item.id, item.data()))
    .filter((org) => org.isDeleted === true)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function restoreOrganization(orgId: string): Promise<void> {
  const org = await getOrganization(orgId)
  if (!org) {
    throw new Error('Cliente não encontrado')
  }
  if (!org.isDeleted) return

  await updateDoc(doc(organizationsCol, orgId), {
    isDeleted: false,
    deletedAt: deleteField(),
    deletedBy: deleteField(),
    expiresAt: deleteField(),
    status: 'active',
    updatedAt: serverTimestamp(),
  })
}

/**
 * Exclui a pasta do cliente de forma permanente: remove membros, convites e o documento.
 * Não apaga contas Auth nem dados operacionais (visitas etc.).
 */
export async function deleteOrganization(orgId: string): Promise<void> {
  const org = await getOrganization(orgId)
  if (!org) {
    throw new Error('Cliente não encontrado')
  }

  const [members, inviteSnap] = await Promise.all([
    listOrganizationMembers(orgId),
    getDocs(query(collection(db, 'invites'), where('orgId', '==', orgId))),
  ])

  await Promise.all(inviteSnap.docs.map((inviteDoc) => deleteDoc(inviteDoc.ref)))

  for (const member of members) {
    await removeOrganizationMember(orgId, member.uid)
  }

  await deleteDoc(doc(organizationsCol, orgId))
}

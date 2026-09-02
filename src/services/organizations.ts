import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { organizationMemberId } from '@/lib/org'
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
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

function mapMember(id: string, data: Record<string, unknown>): OrganizationMember {
  return {
    id,
    orgId: String(data.orgId ?? ''),
    uid: String(data.uid ?? ''),
    email: String(data.email ?? ''),
    name: String(data.name ?? ''),
    orgRole: (data.orgRole as OrgRole) ?? 'user',
    department: data.department ? String(data.department) : undefined,
    invitedBy: data.invitedBy ? String(data.invitedBy) : undefined,
    joinedAt: data.joinedAt,
  }
}

export async function listOrganizations(): Promise<Organization[]> {
  const snap = await getDocs(query(organizationsCol))
  return snap.docs
    .map((item) => mapOrganization(item.id, item.data()))
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

export async function canAddOrganizationMember(orgId: string): Promise<boolean> {
  const org = await getOrganization(orgId)
  if (!org || org.status !== 'active') return false
  const [members, pending] = await Promise.all([
    countOrganizationSeats(orgId),
    countPendingInvites(orgId),
  ])
  return members + pending < org.maxUsers
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
  data: Partial<Pick<Organization, 'name' | 'maxUsers' | 'status'>>,
): Promise<void> {
  await updateDoc(doc(organizationsCol, orgId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

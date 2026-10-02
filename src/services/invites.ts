import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db, functions } from '@/lib/firebase'
import { inviteRoleToOrgRole, inviteRoleToUserRole } from '@/lib/org'
import {
  canAddOrganizationMember,
  addOrganizationMember,
  countOrganizationSeats,
  getOrganization,
  getOrganizationMember,
  mapInviteRoleToOrgRole,
} from '@/services/organizations'
import { httpsCallable } from 'firebase/functions'
import { getEmailDeliveryMode } from '@/services/email'
import { createEmailLog } from '@/services/emailLogs'
import { updateUserProfile } from '@/services/users'
import type { Invite, InviteRole, InviteStatus, OrgRole } from '@/types'

const col = collection(db, 'invites')
const callSendInviteEmail = httpsCallable<{ inviteId: string; origin: string }, { ok: boolean }>(
  functions,
  'sendInviteEmail',
)

function mapInvite(id: string, data: Record<string, unknown>): Invite {
  return {
    id,
    email: String(data.email ?? ''),
    role: data.role as InviteRole,
    token: String(data.token ?? ''),
    status: (data.status as InviteStatus) ?? 'pending',
    createdBy: String(data.createdBy ?? ''),
    orgId: String(data.orgId ?? ''),
    department: data.department ? String(data.department) : undefined,
    visitId: data.visitId ? String(data.visitId) : undefined,
    expiresAt: String(data.expiresAt ?? ''),
    createdAt: data.createdAt,
    acceptedAt: data.acceptedAt,
    acceptedBy: data.acceptedBy ? String(data.acceptedBy) : undefined,
  }
}

export async function createInvite(input: {
  email: string
  role: InviteRole
  createdBy: string
  orgId: string
  department?: string
  visitId?: string
  createdByName?: string
}): Promise<Invite & { link: string; emailSent: boolean; emailError?: string }> {
  const email = input.email.trim().toLowerCase()

  // Substitui convites pendentes do mesmo e-mail nesta empresa (evita link antigo
  // "já utilizado" / vários tokens vivos para a mesma pessoa).
  const previousPending = await getDocs(
    query(
      col,
      where('orgId', '==', input.orgId),
      where('email', '==', email),
      where('status', '==', 'pending'),
    ),
  )
  await Promise.all(previousPending.docs.map((d) => deleteDoc(d.ref)))

  const canAdd = await canAddOrganizationMember(input.orgId)
  if (!canAdd) {
    throw new Error('Limite de usuários da empresa atingido')
  }

  const token = crypto.randomUUID().replace(/-/g, '')
  const expires = new Date()
  expires.setDate(expires.getDate() + 14)
  const expiresAt = expires.toISOString()

  const ref = await addDoc(col, {
    email,
    role: input.role,
    token,
    status: 'pending',
    createdBy: input.createdBy,
    orgId: input.orgId,
    department: input.department?.trim() || null,
    visitId: input.visitId ?? null,
    expiresAt,
    createdAt: serverTimestamp(),
  })

  const invite: Invite = {
    id: ref.id,
    email,
    role: input.role,
    token,
    status: 'pending',
    createdBy: input.createdBy,
    orgId: input.orgId,
    department: input.department,
    visitId: input.visitId,
    expiresAt,
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const link = `${origin}/cadastro?invite=${token}`
  const subject = 'Convite — Promover Experience'
  let emailSent = false
  let emailError: string | undefined
  try {
    await callSendInviteEmail({ inviteId: invite.id, origin })
    emailSent = true
    await createEmailLog({
      to: [invite.email],
      subject,
      visitId: input.visitId,
      kind: 'invite',
      status: 'queued',
      createdBy: input.createdBy,
    })
  } catch (error) {
    console.error('Falha ao enviar e-mail de convite', error)
    emailError = error instanceof Error ? error.message : 'Falha ao enviar e-mail'
  }
  return { ...invite, link, emailSent, emailError }
}

export async function getInviteById(inviteId: string): Promise<Invite | null> {
  const snap = await getDoc(doc(col, inviteId))
  if (!snap.exists()) return null
  return mapInvite(snap.id, snap.data())
}

export async function getInviteByToken(token: string): Promise<Invite | null> {
  const snap = await getDocs(
    query(col, where('token', '==', token), where('status', '==', 'pending')),
  )
  if (snap.empty) return null
  const invite = mapInvite(snap.docs[0].id, snap.docs[0].data())
  if (new Date(invite.expiresAt).getTime() < Date.now()) return null
  return invite
}

/**
 * Vincula usuário Auth já existente à empresa do convite (corrige "e-mail em uso"
 * + "conta sem empresa" quando o Auth foi criado sem membership).
 */
export async function joinOrganizationFromInvite(input: {
  token: string
  uid: string
  email: string
  name?: string
}): Promise<{ orgId: string; inviteId: string }> {
  const invite = await getInviteByToken(input.token)
  if (!invite) {
    throw new Error('Convite inválido, expirado ou já utilizado')
  }

  const email = input.email.trim().toLowerCase()
  const inviteEmail = invite.email.trim().toLowerCase()
  if (inviteEmail !== email) {
    throw new Error(
      `Este convite é para ${invite.email}. Entre com esse e-mail ou peça um novo convite.`,
    )
  }

  const org = await getOrganization(invite.orgId)
  if (!org || org.status !== 'active') {
    throw new Error('Esta empresa não está disponível para novos membros')
  }

  const alreadyMember = await getOrganizationMember(invite.orgId, input.uid)
  if (!alreadyMember) {
    const members = await countOrganizationSeats(invite.orgId)
    if (members >= org.maxUsers) {
      throw new Error('Limite de usuários da empresa atingido')
    }
  }

  const orgRole = inviteRoleToOrgRole(invite.role)
  const role = inviteRoleToUserRole(invite.role)

  // setDoc é idempotente — evita get em membership inexistente (rules negavam).
  await addOrganizationMember({
    orgId: invite.orgId,
    uid: input.uid,
    email,
    name: input.name?.trim() || email,
    orgRole,
    department: invite.department,
    invitedBy: invite.createdBy,
  })

  await updateUserProfile(input.uid, {
    orgId: invite.orgId,
    role,
  })

  await acceptInvite(invite.id, input.uid)
  return { orgId: invite.orgId, inviteId: invite.id }
}

export async function acceptInvite(inviteId: string, uid: string): Promise<void> {
  await updateDoc(doc(col, inviteId), {
    status: 'accepted',
    acceptedBy: uid,
    acceptedAt: serverTimestamp(),
  })
}

export async function listPendingInvitesByOrg(orgId: string): Promise<Invite[]> {
  const snap = await getDocs(
    query(col, where('orgId', '==', orgId), where('status', '==', 'pending')),
  )
  return snap.docs
    .map((d) => mapInvite(d.id, d.data()))
    .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))
}

export function subscribePendingInvitesByOrg(
  orgId: string,
  onChange: (invites: Invite[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(col, where('orgId', '==', orgId), where('status', '==', 'pending')),
    (snap) => {
      onChange(
        snap.docs
          .map((item) => mapInvite(item.id, item.data()))
          .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt)),
      )
    },
    onError,
  )
}

export async function listInvitesByOrg(orgId: string): Promise<Invite[]> {
  const snap = await getDocs(query(col, where('orgId', '==', orgId)))
  return snap.docs
    .map((d) => mapInvite(d.id, d.data()))
    .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))
}

export async function cancelInvite(inviteId: string): Promise<void> {
  await deleteDoc(doc(col, inviteId))
}

export async function cancelPendingInvitesForEmail(orgId: string, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase()
  const snap = await getDocs(
    query(
      col,
      where('orgId', '==', orgId),
      where('email', '==', normalized),
      where('status', '==', 'pending'),
    ),
  )
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
}

export async function listInvitesByCreator(createdBy: string): Promise<Invite[]> {
  const snap = await getDocs(query(col, where('createdBy', '==', createdBy)))
  return snap.docs
    .map((d) => mapInvite(d.id, d.data()))
    .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))
}

export { inviteRoleToOrgRole, mapInviteRoleToOrgRole }
export type { OrgRole }
export { getEmailDeliveryMode }

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
  where,
} from 'firebase/firestore'
import { db, functions } from '@/lib/firebase'
import { inviteRoleToOrgRole } from '@/lib/org'
import { normalizePhoneE164 } from '@/lib/utils'
import {
  canAddOrganizationMember,
  mapInviteRoleToOrgRole,
} from '@/services/organizations'
import { httpsCallable } from 'firebase/functions'
import type {
  Invite,
  InviteAcceptedVia,
  InviteDeclinedVia,
  InviteRole,
  InviteStatus,
  InviteWhatsAppSendStatus,
  OrgRole,
} from '@/types'

/** Campos que podem ser devolvidos ao portador de um token de convite. */
export type PublicInvite = Pick<
  Invite,
  'id' | 'email' | 'role' | 'status' | 'orgId' | 'department' | 'visitId' | 'expiresAt'
>

const col = collection(db, 'invites')
const callSendInviteEmail = httpsCallable<{ inviteId: string; origin: string }, { ok: boolean }>(
  functions,
  'sendInviteEmail',
)
const callSendInviteWhatsApp = httpsCallable<
  { inviteId: string },
  { status: InviteWhatsAppSendStatus; messageId?: string; detail?: string }
>(functions, 'sendInviteWhatsApp')
const callGetInviteByToken = httpsCallable<{ token: string }, PublicInvite>(
  functions,
  'getInviteByToken',
)
const callAcceptInvite = httpsCallable<
  { token: string; name?: string },
  { orgId: string; inviteId: string; visitId?: string }
>(functions, 'acceptInvite')

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
    phone: data.phone ? String(data.phone) : undefined,
    phoneE164: data.phoneE164 ? String(data.phoneE164) : undefined,
    whatsappSendStatus: data.whatsappSendStatus as InviteWhatsAppSendStatus | undefined,
    whatsappMessageId: data.whatsappMessageId ? String(data.whatsappMessageId) : undefined,
    whatsappSentAt: data.whatsappSentAt ? String(data.whatsappSentAt) : undefined,
    whatsappError: data.whatsappError ? String(data.whatsappError) : undefined,
    expiresAt: String(data.expiresAt ?? ''),
    createdAt: data.createdAt,
    acceptedAt: data.acceptedAt,
    acceptedBy: data.acceptedBy ? String(data.acceptedBy) : undefined,
    acceptedVia: data.acceptedVia as InviteAcceptedVia | undefined,
    declinedAt: data.declinedAt,
    declinedVia: data.declinedVia as InviteDeclinedVia | undefined,
  }
}

export async function createInvite(input: {
  email: string
  role: InviteRole
  createdBy: string
  orgId: string
  department?: string
  visitId?: string
  /** Celular/WhatsApp — obrigatório para convite de cliente (envio Meta). */
  phone?: string
  createdByName?: string
}): Promise<
  Invite & {
    link: string
    emailSent: boolean
    emailError?: string
    whatsappSent: boolean
    whatsappStatus?: InviteWhatsAppSendStatus
    whatsappError?: string
  }
> {
  const email = input.email.trim().toLowerCase()
  const visitId = input.visitId?.trim() || undefined
  const phoneRaw = input.phone?.trim() || ''
  const phoneE164 = phoneRaw ? normalizePhoneE164(phoneRaw) : null
  if (input.role === 'client' && !visitId) {
    throw new Error('Convite de cliente precisa de um evento/visita')
  }
  if (input.role === 'client' && !phoneE164) {
    throw new Error('Informe um WhatsApp/celular válido para o convite de cliente')
  }

  // Substitui convites pendentes do mesmo e-mail nesta empresa (evita link antigo
  // "já utilizado" / vários tokens vivos para a mesma pessoa).
  const previousQuery = query(
    col,
    where('orgId', '==', input.orgId),
    where('email', '==', email),
    where('status', '==', 'pending'),
  )
  let previousPending
  try {
    previousPending = await getDocs(previousQuery)
  } catch (error) {
    if (input.role !== 'client') throw error
    previousPending = await getDocs(
      query(
        col,
        where('orgId', '==', input.orgId),
        where('email', '==', email),
        where('status', '==', 'pending'),
        where('role', '==', 'client'),
      ),
    )
  }
  await Promise.all(
    previousPending.docs.map(async (pendingDoc) => {
      try {
        await deleteDoc(pendingDoc.ref)
      } catch (error) {
        // Funcionário só cancela convites de cliente. Um convite de outro perfil
        // para o mesmo e-mail permanece com quem tem permissão de gestão.
        if (input.role === 'client' && pendingDoc.data().role !== 'client') return
        throw error
      }
    }),
  )

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
    visitId: visitId ?? null,
    phone: phoneRaw || null,
    phoneE164: phoneE164 ?? null,
    whatsappSendStatus: phoneE164 ? 'pending' : null,
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
    visitId,
    phone: phoneRaw || undefined,
    phoneE164: phoneE164 ?? undefined,
    whatsappSendStatus: phoneE164 ? 'pending' : undefined,
    expiresAt,
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const link = `${origin}/cadastro?invite=${token}`
  let emailSent = false
  let emailError: string | undefined
  try {
    await callSendInviteEmail({ inviteId: invite.id, origin })
    emailSent = true
  } catch (error) {
    console.error('Falha ao enviar e-mail de convite', error)
    emailError = error instanceof Error ? error.message : 'Falha ao enviar e-mail'
  }

  let whatsappSent = false
  let whatsappStatus: InviteWhatsAppSendStatus | undefined
  let whatsappError: string | undefined
  if (phoneE164 && input.role === 'client') {
    try {
      const { data } = await callSendInviteWhatsApp({ inviteId: invite.id })
      whatsappStatus = data.status
      whatsappSent = data.status === 'sent'
      if (!whatsappSent) {
        whatsappError = data.detail || data.status
      }
    } catch (error) {
      console.error('Falha ao enviar WhatsApp de convite', error)
      whatsappStatus = 'error'
      whatsappError = error instanceof Error ? error.message : 'Falha ao enviar WhatsApp'
    }
  }

  return {
    ...invite,
    link,
    emailSent,
    emailError,
    whatsappSent,
    whatsappStatus,
    whatsappError,
  }
}

export async function getInviteById(inviteId: string): Promise<Invite | null> {
  const snap = await getDoc(doc(col, inviteId))
  if (!snap.exists()) return null
  return mapInvite(snap.id, snap.data())
}

export async function getInviteByToken(token: string): Promise<PublicInvite | null> {
  const trimmed = token.trim()
  if (!trimmed) return null
  try {
    const { data } = await callGetInviteByToken({ token: trimmed })
    if (!data?.id || new Date(data.expiresAt).getTime() < Date.now()) return null
    return data
  } catch {
    return null
  }
}

/**
 * Vincula usuário Auth já existente à empresa do convite (corrige "e-mail em uso"
 * + "conta sem empresa" quando o Auth foi criado sem membership).
 */
export async function joinOrganizationFromInvite(input: {
  token: string
  name?: string
}): Promise<{ orgId: string; inviteId: string; visitId?: string }> {
  try {
    const { data } = await callAcceptInvite({
      token: input.token.trim(),
      name: input.name?.trim() || undefined,
    })
    return data
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Não foi possível aceitar o convite')
  }
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

export function subscribePendingClientInvitesByOrg(
  orgId: string,
  onChange: (invites: Invite[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(
      col,
      where('orgId', '==', orgId),
      where('status', '==', 'pending'),
      where('role', '==', 'client'),
    ),
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

export function subscribePendingClientInvitesByVisit(
  orgId: string,
  visitId: string,
  onChange: (invites: Invite[]) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(
      col,
      where('orgId', '==', orgId),
      where('visitId', '==', visitId),
      where('status', '==', 'pending'),
      where('role', '==', 'client'),
    ),
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

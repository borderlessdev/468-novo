import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore'
import { readCargoFields } from './cargo'

const db = getFirestore()

const INVITE_ROLES = new Set(['org_admin', 'team', 'client', 'user'])

export type InviteAcceptedVia = 'web' | 'whatsapp'
export type InviteDeclinedVia = 'whatsapp' | 'web'

function requireToken(value: unknown): string {
  const token = typeof value === 'string' ? value.trim() : ''
  if (!/^[a-f0-9]{32}$/i.test(token)) {
    throw new HttpsError('invalid-argument', 'Convite inválido.')
  }
  return token
}

function isExpired(value: unknown): boolean {
  const date = new Date(String(value ?? ''))
  return !Number.isFinite(date.getTime()) || date.getTime() <= Date.now()
}

function userRoleForInvite(role: string): 'user' | 'team' | 'client' {
  return role === 'team' || role === 'client' ? role : 'user'
}

export interface ApplyInviteAcceptanceInput {
  uid: string
  email: string
  inviteRef: DocumentReference
  invite: DocumentData
  requestedName?: string
  fallbackName?: string
  acceptedVia: InviteAcceptedVia
  /** Quando true, grava phoneE164 no perfil do usuário. */
  phoneE164?: string | null
}

export interface ApplyInviteAcceptanceResult {
  orgId: string
  inviteId: string
  visitId?: string
}

/**
 * Corpo transacional compartilhado entre aceite web (callable) e WhatsApp (webhook).
 * Deve ser chamado dentro de `db.runTransaction`.
 */
export async function applyInviteAcceptanceInTransaction(
  transaction: Transaction,
  input: ApplyInviteAcceptanceInput,
): Promise<ApplyInviteAcceptanceResult> {
  const { uid, email, inviteRef, invite, acceptedVia } = input
  const orgId = String(invite.orgId ?? '')
  const role = String(invite.role ?? '')
  if (invite.status !== 'pending' || isExpired(invite.expiresAt) || !INVITE_ROLES.has(role) || !orgId) {
    throw new HttpsError('failed-precondition', 'Convite expirado ou já utilizado.')
  }
  if (String(invite.email ?? '').trim().toLowerCase() !== email) {
    throw new HttpsError('permission-denied', 'Este convite pertence a outro e-mail.')
  }

  const visitId = invite.visitId ? String(invite.visitId).trim() : ''
  if (role === 'client' && !visitId) {
    throw new HttpsError(
      'failed-precondition',
      'Convite de cliente sem evento. Peça um novo convite pela visita.',
    )
  }

  const orgRef = db.collection('organizations').doc(orgId)
  const org = await transaction.get(orgRef)
  if (!org.exists || org.get('status') !== 'active') {
    throw new HttpsError('failed-precondition', 'Esta empresa não está disponível para novos membros.')
  }

  let visitRef: DocumentReference | null = null
  if (role === 'client' && visitId) {
    visitRef = db.collection('visits').doc(visitId)
    const visitSnap = await transaction.get(visitRef)
    if (!visitSnap.exists || visitSnap.get('isDeleted') === true) {
      throw new HttpsError('failed-precondition', 'O evento deste convite não está disponível.')
    }
    if (String(visitSnap.get('orgId') ?? '') !== orgId) {
      throw new HttpsError('failed-precondition', 'O evento não pertence à empresa do convite.')
    }
  }

  const membersSnap = await transaction.get(
    db.collection('organizationMembers').where('orgId', '==', orgId),
  )
  const pendingSnap = await transaction.get(
    db.collection('invites').where('orgId', '==', orgId).where('status', '==', 'pending'),
  )
  const maxUsers = Number(org.get('maxUsers'))
  if (Number.isFinite(maxUsers) && maxUsers > 0) {
    const alreadyMember = membersSnap.docs.some((item) => item.get('uid') === uid)
    const otherPending = pendingSnap.docs.filter((item) => item.ref.id !== inviteRef.id).length
    const projectedMembers = membersSnap.size + (alreadyMember ? 0 : 1)
    if (projectedMembers + otherPending > maxUsers) {
      throw new HttpsError('resource-exhausted', 'Limite de usuários da empresa atingido.')
    }
  }

  const userRef = db.collection('users').doc(uid)
  const user = await transaction.get(userRef)
  const name = (
    input.requestedName ||
    String(user.get('name') ?? input.fallbackName ?? email)
  ).slice(0, 160)
  const now = FieldValue.serverTimestamp()
  const phoneE164 = input.phoneE164?.trim() || undefined
  transaction.set(
    userRef,
    {
      uid,
      email,
      name,
      orgId,
      role: userRoleForInvite(role),
      updatedAt: now,
      ...(phoneE164 ? { phoneE164 } : {}),
      ...(user.exists ? {} : { createdAt: now }),
    },
    { merge: true },
  )
  const { cargo, cargoRegion } = readCargoFields(invite)
  transaction.set(
    db.collection('organizationMembers').doc(`${orgId}_${uid}`),
    {
      orgId,
      uid,
      email,
      name,
      orgRole: role,
      cargo,
      cargoRegion,
      department: invite.department ? String(invite.department) : null,
      invitedBy: invite.createdBy ? String(invite.createdBy) : null,
      joinedAt: now,
    },
    { merge: true },
  )
  if (visitRef) {
    transaction.update(visitRef, {
      clientUserIds: FieldValue.arrayUnion(uid),
      updatedAt: now,
    })
  }
  transaction.update(inviteRef, {
    status: 'accepted',
    acceptedBy: uid,
    acceptedAt: now,
    acceptedVia,
  })

  return {
    orgId,
    inviteId: inviteRef.id,
    ...(visitId ? { visitId } : {}),
  }
}

/** Aceite via Admin SDK (WhatsApp) — sem request.auth do cliente. */
export async function acceptInviteAsAdmin(input: {
  token: string
  uid: string
  email: string
  name?: string
  acceptedVia: InviteAcceptedVia
  phoneE164?: string | null
}): Promise<ApplyInviteAcceptanceResult> {
  const token = requireToken(input.token)
  const email = input.email.trim().toLowerCase()
  if (!email) throw new HttpsError('failed-precondition', 'E-mail obrigatório.')

  return db.runTransaction(async (transaction) => {
    const invites = await transaction.get(
      db.collection('invites').where('token', '==', token).limit(1),
    )
    if (invites.empty) throw new HttpsError('not-found', 'Convite não encontrado.')
    const inviteRef = invites.docs[0].ref
    const invite = invites.docs[0].data()
    return applyInviteAcceptanceInTransaction(transaction, {
      uid: input.uid,
      email,
      inviteRef,
      invite,
      requestedName: input.name,
      acceptedVia: input.acceptedVia,
      phoneE164: input.phoneE164,
    })
  })
}

export async function declineInviteById(input: {
  inviteId: string
  declinedVia: InviteDeclinedVia
}): Promise<{ inviteId: string; status: 'declined' | 'already_closed' }> {
  const ref = db.collection('invites').doc(input.inviteId)
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Convite não encontrado.')
    const status = String(snap.get('status') ?? '')
    if (status === 'declined') return { inviteId: ref.id, status: 'already_closed' as const }
    if (status !== 'pending') {
      throw new HttpsError('failed-precondition', 'Convite não está pendente.')
    }
    if (isExpired(snap.get('expiresAt'))) {
      throw new HttpsError('failed-precondition', 'Convite expirado.')
    }
    transaction.update(ref, {
      status: 'declined',
      declinedAt: FieldValue.serverTimestamp(),
      declinedVia: input.declinedVia,
    })
    return { inviteId: ref.id, status: 'declined' as const }
  })
}

/**
 * Valida um token sem expor a coleção de convites. É público para permitir que
 * a tela de cadastro preencha o e-mail, mas retorna somente dados necessários
 * para aquele fluxo — nunca o token nem quem criou o convite.
 */
export const getInviteByToken = onCall({ invoker: 'public' }, async (request) => {
  const token = requireToken(request.data?.token)
  const snap = await db.collection('invites').where('token', '==', token).limit(1).get()
  if (snap.empty) throw new HttpsError('not-found', 'Convite não encontrado.')

  const doc = snap.docs[0]
  const invite = doc.data()
  if (invite.status !== 'pending' || isExpired(invite.expiresAt)) {
    throw new HttpsError('failed-precondition', 'Convite expirado ou já utilizado.')
  }
  const role = String(invite.role ?? '')
  const email = String(invite.email ?? '').trim().toLowerCase()
  const orgId = String(invite.orgId ?? '')
  const visitId = invite.visitId ? String(invite.visitId).trim() : undefined
  if (!INVITE_ROLES.has(role) || !email || !orgId) {
    throw new HttpsError('failed-precondition', 'Convite inválido.')
  }
  if (role === 'client' && !visitId) {
    throw new HttpsError(
      'failed-precondition',
      'Convite de cliente sem evento. Peça um novo convite pela visita.',
    )
  }

  const { cargo, cargoRegion } = readCargoFields(invite)
  return {
    id: doc.id,
    email,
    role,
    status: 'pending',
    orgId,
    cargo: cargo ?? undefined,
    cargoRegion: cargoRegion ?? undefined,
    department: invite.department ? String(invite.department) : undefined,
    visitId,
    expiresAt: String(invite.expiresAt),
  }
})

/**
 * Aceita o convite de forma atômica e cria perfil/membership via Admin SDK.
 * `invoker: 'public'` libera o preflight do navegador; o login continua obrigatório abaixo.
 */
export const acceptInvite = onCall({ cors: true, invoker: 'public' }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Faça login para aceitar o convite.')
  const token = requireToken(request.data?.token)
  const uid = request.auth.uid
  const email = String(request.auth.token.email ?? '').trim().toLowerCase()
  if (!email) throw new HttpsError('failed-precondition', 'A conta não possui e-mail.')
  const requestedName =
    typeof request.data?.name === 'string' ? request.data.name.trim().slice(0, 160) : ''

  return db.runTransaction(async (transaction) => {
    const invites = await transaction.get(
      db.collection('invites').where('token', '==', token).limit(1),
    )
    if (invites.empty) throw new HttpsError('not-found', 'Convite não encontrado.')

    const inviteRef = invites.docs[0].ref
    const invite = invites.docs[0].data()
    return applyInviteAcceptanceInTransaction(transaction, {
      uid,
      email,
      inviteRef,
      invite,
      requestedName,
      fallbackName: String(request.auth?.token.name ?? ''),
      acceptedVia: 'web',
    })
  })
})

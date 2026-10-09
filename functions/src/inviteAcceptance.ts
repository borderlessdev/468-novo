import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const db = getFirestore()

const INVITE_ROLES = new Set(['org_admin', 'team', 'client', 'user'])

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
  if (!INVITE_ROLES.has(role) || !email || !orgId) {
    throw new HttpsError('failed-precondition', 'Convite inválido.')
  }

  return {
    id: doc.id,
    email,
    role,
    status: 'pending',
    orgId,
    department: invite.department ? String(invite.department) : undefined,
    visitId: invite.visitId ? String(invite.visitId) : undefined,
    expiresAt: String(invite.expiresAt),
  }
})

/** Aceita o convite de forma atômica e cria perfil/membership via Admin SDK. */
export const acceptInvite = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Faça login para aceitar o convite.')
  const token = requireToken(request.data?.token)
  const uid = request.auth.uid
  const email = String(request.auth.token.email ?? '').trim().toLowerCase()
  if (!email) throw new HttpsError('failed-precondition', 'A conta não possui e-mail.')
  const requestedName = typeof request.data?.name === 'string'
    ? request.data.name.trim().slice(0, 160)
    : ''

  return db.runTransaction(async (transaction) => {
    const invites = await transaction.get(
      db.collection('invites').where('token', '==', token).limit(1),
    )
    if (invites.empty) throw new HttpsError('not-found', 'Convite não encontrado.')

    const inviteRef = invites.docs[0].ref
    const invite = invites.docs[0].data()
    const orgId = String(invite.orgId ?? '')
    const role = String(invite.role ?? '')
    if (invite.status !== 'pending' || isExpired(invite.expiresAt) || !INVITE_ROLES.has(role) || !orgId) {
      throw new HttpsError('failed-precondition', 'Convite expirado ou já utilizado.')
    }
    if (String(invite.email ?? '').trim().toLowerCase() !== email) {
      throw new HttpsError('permission-denied', 'Este convite pertence a outro e-mail.')
    }

    const orgRef = db.collection('organizations').doc(orgId)
    const org = await transaction.get(orgRef)
    if (!org.exists || org.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'Esta empresa não está disponível para novos membros.')
    }

    const userRef = db.collection('users').doc(uid)
    const user = await transaction.get(userRef)
    const name = requestedName || String(user.get('name') ?? request.auth?.token.name ?? email).slice(0, 160)
    const now = FieldValue.serverTimestamp()
    transaction.set(userRef, {
      uid,
      email,
      name,
      orgId,
      role: userRoleForInvite(role),
      updatedAt: now,
      ...(user.exists ? {} : { createdAt: now }),
    }, { merge: true })
    transaction.set(db.collection('organizationMembers').doc(`${orgId}_${uid}`), {
      orgId,
      uid,
      email,
      name,
      orgRole: role,
      department: invite.department ? String(invite.department) : null,
      invitedBy: invite.createdBy ? String(invite.createdBy) : null,
      joinedAt: now,
    }, { merge: true })
    transaction.update(inviteRef, {
      status: 'accepted',
      acceptedBy: uid,
      acceptedAt: now,
    })

    return { orgId, inviteId: inviteRef.id }
  })
})

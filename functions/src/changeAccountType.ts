import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  decideAccountTypeChange,
  isAccountType,
  type AccountType,
} from './accountTypePolicy'
import { callerIsPlatformAdmin } from './platformAdmin'

const db = getFirestore()

function asToken(token: unknown): Record<string, unknown> {
  return token && typeof token === 'object' ? (token as Record<string, unknown>) : {}
}

function readOrgId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Altera o tipo de qualquer usuário. Somente administrador master.
 * Não apaga a conta, o vínculo com a empresa nem os demais dados do perfil.
 */
export const changeUserAccountType = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Faça login.')
  }

  const callerUid = request.auth.uid
  const callerIsMaster = await callerIsPlatformAdmin(callerUid, asToken(request.auth.token))
  if (!callerIsMaster) {
    throw new HttpsError(
      'permission-denied',
      'Apenas o administrador master pode alterar o tipo de usuário.',
    )
  }

  const targetUid = String(request.data?.uid ?? '').trim()
  const nextType: unknown = request.data?.accountType
  const requestedOrgId = readOrgId(request.data?.orgId)
  if (!targetUid || targetUid.length > 128) {
    throw new HttpsError('invalid-argument', 'Usuário inválido.')
  }
  if (!isAccountType(nextType)) {
    throw new HttpsError('invalid-argument', 'Tipo de usuário inválido.')
  }

  const userRef = db.collection('users').doc(targetUid)
  const preview = await userRef.get()
  if (!preview.exists) {
    throw new HttpsError('not-found', 'Usuário não encontrado.')
  }

  const profileOrgId = readOrgId(preview.get('orgId'))
  if (requestedOrgId && profileOrgId && requestedOrgId !== profileOrgId) {
    throw new HttpsError(
      'failed-precondition',
      'Não é permitido mover o usuário de empresa ao alterar o tipo.',
    )
  }

  let targetHasMasterClaim = preview.get('role') === 'admin'
  try {
    const authUser = await getAuth().getUser(targetUid)
    const claims = authUser.customClaims ?? {}
    targetHasMasterClaim =
      targetHasMasterClaim || claims.admin === true || claims.platformAdmin === true
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code !== 'auth/user-not-found') throw error
  }

  const orgId = profileOrgId || requestedOrgId
  const memberRef = orgId
    ? db.collection('organizationMembers').doc(`${orgId}_${targetUid}`)
    : null

  const applied = await db.runTransaction(async (transaction) => {
    const mastersSnap = await transaction.get(
      db.collection('users').where('role', '==', 'admin'),
    )
    const userSnap = await transaction.get(userRef)
    const memberSnap = memberRef ? await transaction.get(memberRef) : null
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'Usuário não encontrado.')
    }

    const lockedOrgId = readOrgId(userSnap.get('orgId'))
    if (requestedOrgId && lockedOrgId && requestedOrgId !== lockedOrgId) {
      throw new HttpsError(
        'failed-precondition',
        'Não é permitido mover o usuário de empresa ao alterar o tipo.',
      )
    }
    if (memberRef && lockedOrgId && orgId !== lockedOrgId) {
      throw new HttpsError(
        'failed-precondition',
        'Não é permitido mover o usuário de empresa ao alterar o tipo.',
      )
    }

    const targetIsMaster = userSnap.get('role') === 'admin' || targetHasMasterClaim
    const memberRole = memberSnap?.get('orgRole')
    const profileRole = userSnap.get('role')
    const currentType: AccountType = targetIsMaster
      ? 'admin_master'
      : isAccountType(memberRole)
        ? memberRole
        : isAccountType(profileRole)
          ? profileRole
          : 'user'

    const decision = decideAccountTypeChange({
      callerIsMaster: true,
      targetExists: true,
      targetIsMaster,
      otherMasterCount: mastersSnap.docs.filter((doc) => doc.id !== targetUid).length,
      currentType,
      nextType,
      hasOrganizationLink: memberSnap?.exists === true,
    })
    if (!decision.ok) {
      throw new HttpsError(decision.code, decision.message)
    }
    if (decision.unchanged) {
      return { accountType: nextType, claimsChanged: false, claimsAction: decision.claims }
    }

    const userPatch: Record<string, unknown> = {
      role: decision.profileRole,
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (!lockedOrgId && orgId && memberSnap?.exists) {
      userPatch.orgId = orgId
    }
    transaction.update(userRef, userPatch)
    if (decision.orgRole && memberSnap?.exists && memberRef) {
      transaction.update(memberRef, { orgRole: decision.orgRole })
    }
    return {
      accountType: nextType,
      claimsChanged: decision.claims !== 'keep',
      claimsAction: decision.claims,
    }
  })

  if (applied.claimsAction !== 'keep') {
    try {
      const authUser = await getAuth().getUser(targetUid)
      const claims: Record<string, unknown> = { ...(authUser.customClaims ?? {}) }
      if (applied.claimsAction === 'grant') {
        claims.admin = true
        claims.platformAdmin = true
      } else {
        delete claims.admin
        delete claims.platformAdmin
        delete claims.role
      }
      await getAuth().setCustomUserClaims(targetUid, claims)
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code !== 'auth/user-not-found') {
        throw new HttpsError(
          'internal',
          'O perfil foi salvo, mas as permissões de acesso não foram atualizadas. Tente novamente.',
        )
      }
    }
  }

  return { accountType: applied.accountType, claimsChanged: applied.claimsChanged }
})

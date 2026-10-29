import { getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { normalizeCargoInput } from './cargo'
import { callerIsPlatformAdmin } from './platformAdmin'

function db(): Firestore {
  if (getApps().length === 0) initializeApp()
  return getFirestore()
}

function asToken(token: unknown): Record<string, unknown> {
  return token && typeof token === 'object' ? (token as Record<string, unknown>) : {}
}

/**
 * Altera o cargo (organograma) de um membro da empresa.
 * Master ou admin da mesma empresa. Não muda orgRole / tipo de conta.
 * Admin da empresa não altera cargo de outro org_admin.
 */
export const changeEmployeeCargo = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Faça login.')
  }

  const callerUid = request.auth.uid
  const callerIsMaster = await callerIsPlatformAdmin(callerUid, asToken(request.auth.token))

  const orgId = String(request.data?.orgId ?? '').trim()
  const targetUid = String(request.data?.uid ?? '').trim()
  const normalized = normalizeCargoInput(request.data?.cargo, request.data?.cargoRegion)
  if ('error' in normalized) {
    throw new HttpsError('invalid-argument', normalized.error)
  }
  if (!orgId || orgId.length > 128) {
    throw new HttpsError('invalid-argument', 'Empresa inválida.')
  }
  if (!targetUid || targetUid.length > 128) {
    throw new HttpsError('invalid-argument', 'Usuário inválido.')
  }

  const firestore = db()
  const memberRef = firestore.collection('organizationMembers').doc(`${orgId}_${targetUid}`)
  const callerMemberRef = firestore.collection('organizationMembers').doc(`${orgId}_${callerUid}`)

  const result = await firestore.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef)
    if (!memberSnap.exists) {
      throw new HttpsError('not-found', 'Membro não encontrado nesta empresa.')
    }

    const targetOrgRole = String(memberSnap.get('orgRole') ?? '')
    if (!callerIsMaster) {
      const callerMemberSnap = await transaction.get(callerMemberRef)
      if (!callerMemberSnap.exists || callerMemberSnap.get('orgRole') !== 'org_admin') {
        throw new HttpsError(
          'permission-denied',
          'Apenas o admin da empresa pode alterar o cargo dos funcionários.',
        )
      }
      if (targetOrgRole === 'org_admin' && targetUid !== callerUid) {
        throw new HttpsError(
          'permission-denied',
          'Não é permitido alterar o cargo de outro administrador da empresa.',
        )
      }
    }

    const currentCargo = memberSnap.get('cargo')
    const currentRegion = memberSnap.get('cargoRegion') ?? null
    if (
      currentCargo === normalized.cargo &&
      (normalized.cargoRegion ?? null) === (currentRegion || null)
    ) {
      return {
        unchanged: true as const,
        cargo: normalized.cargo,
        cargoRegion: normalized.cargoRegion,
      }
    }

    transaction.update(memberRef, {
      cargo: normalized.cargo,
      cargoRegion: normalized.cargoRegion,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return {
      unchanged: false as const,
      cargo: normalized.cargo,
      cargoRegion: normalized.cargoRegion,
    }
  })

  return result
})

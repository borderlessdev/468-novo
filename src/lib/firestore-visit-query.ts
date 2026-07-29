import {
  getDocs,
  query,
  where,
  type CollectionReference,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'

function isPermissionDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'permission-denied'
  )
}

export function isFirestorePermissionDenied(error: unknown): boolean {
  return isPermissionDenied(error)
}

/**
 * Lista documentos filhos de uma visita.
 * Tenta por visitId (regras novas); se negado, usa ownerId+visitId (regras antigas).
 */
export async function getVisitChildDocs<T>(
  colRef: CollectionReference,
  visitId: string,
  ownerId: string | undefined,
  isAdmin: boolean | undefined,
  mapDoc: (doc: QueryDocumentSnapshot) => T,
): Promise<T[]> {
  try {
    const snap = await getDocs(query(colRef, where('visitId', '==', visitId)))
    return snap.docs.map(mapDoc)
  } catch (error) {
    if (!isPermissionDenied(error) || isAdmin || !ownerId) throw error
    const snap = await getDocs(
      query(
        colRef,
        where('ownerId', '==', ownerId),
        where('visitId', '==', visitId),
      ),
    )
    return snap.docs.map(mapDoc)
  }
}

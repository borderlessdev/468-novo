import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage'
import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db, storage } from '@/lib/firebase'
import { getOrganization } from '@/services/organizations'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024

function validateLogoFile(file: File) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Use JPG, PNG, WEBP ou GIF.')
  }
  if (file.size > MAX_SIZE) {
    throw new Error('Arquivo muito grande. Máximo 5 MB.')
  }
}

function extensionFor(file: File): string {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/gif') return 'gif'
  return 'jpg'
}

export async function uploadOrganizationLogo(
  orgId: string,
  file: File,
): Promise<{ logoUrl: string; logoStoragePath: string }> {
  validateLogoFile(file)

  const previous = await getOrganization(orgId)
  const storagePath = `organizations/${orgId}/logo-${Date.now()}.${extensionFor(file)}`
  const storageRef = ref(storage, storagePath)

  await uploadBytes(storageRef, file, { contentType: file.type })
  let logoUrl: string
  try {
    logoUrl = await getDownloadURL(storageRef)
  } catch (error) {
    await deleteObject(storageRef).catch(() => undefined)
    throw error
  }

  try {
    await updateDoc(doc(db, 'organizations', orgId), {
      logoUrl,
      logoStoragePath: storagePath,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    await deleteObject(storageRef).catch(() => undefined)
    throw error
  }

  if (previous?.logoStoragePath && previous.logoStoragePath !== storagePath) {
    await deleteObject(ref(storage, previous.logoStoragePath)).catch(() => undefined)
  }

  return { logoUrl, logoStoragePath: storagePath }
}

export async function removeOrganizationLogo(orgId: string): Promise<void> {
  const previous = await getOrganization(orgId)
  if (previous?.logoStoragePath) {
    await deleteObject(ref(storage, previous.logoStoragePath)).catch(() => undefined)
  }

  await updateDoc(doc(db, 'organizations', orgId), {
    logoUrl: deleteField(),
    logoStoragePath: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

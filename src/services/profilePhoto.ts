import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage'
import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db, storage } from '@/lib/firebase'
import { getUserProfile } from '@/services/users'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024

function validatePhotoFile(file: File) {
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

export async function uploadProfilePhoto(
  uid: string,
  file: File,
): Promise<{ photoURL: string; photoStoragePath: string }> {
  validatePhotoFile(file)

  const previous = await getUserProfile(uid)
  const storagePath = `profiles/${uid}/avatar-${Date.now()}.${extensionFor(file)}`
  const storageRef = ref(storage, storagePath)

  await uploadBytes(storageRef, file, { contentType: file.type })
  let photoURL: string
  try {
    photoURL = await getDownloadURL(storageRef)
  } catch (error) {
    await deleteObject(storageRef).catch(() => undefined)
    throw error
  }

  try {
    await updateDoc(doc(db, 'users', uid), {
      photoURL,
      photoStoragePath: storagePath,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    await deleteObject(storageRef).catch(() => undefined)
    throw error
  }

  if (previous?.photoStoragePath && previous.photoStoragePath !== storagePath) {
    await deleteObject(ref(storage, previous.photoStoragePath)).catch(() => undefined)
  }

  return { photoURL, photoStoragePath: storagePath }
}

export async function removeProfilePhoto(uid: string): Promise<void> {
  const previous = await getUserProfile(uid)
  if (previous?.photoStoragePath) {
    await deleteObject(ref(storage, previous.photoStoragePath)).catch(() => undefined)
  }

  await updateDoc(doc(db, 'users', uid), {
    photoURL: deleteField(),
    photoStoragePath: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

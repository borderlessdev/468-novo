import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Task, TaskStatus } from '@/types'

const col = collection(db, 'tasks')

function mapTask(id: string, data: Record<string, unknown>): Task {
  return {
    id,
    visitId: String(data.visitId ?? ''),
    title: String(data.title ?? ''),
    status: (data.status as TaskStatus) ?? 'backlog',
    order: Number(data.order ?? 0),
    dueDate: data.dueDate ? String(data.dueDate) : undefined,
    ownerId: String(data.ownerId ?? ''),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

function sortTasks(tasks: Task[]): Task[] {
  const statusOrder: Record<TaskStatus, number> = {
    backlog: 0,
    in_progress: 1,
    completed: 2,
  }
  return [...tasks].sort((a, b) => {
    const byStatus = statusOrder[a.status] - statusOrder[b.status]
    if (byStatus !== 0) return byStatus
    return a.order - b.order
  })
}

export async function listTasks(
  visitId: string,
  ownerId: string,
  isAdmin: boolean,
): Promise<Task[]> {
  const constraints = isAdmin
    ? [where('visitId', '==', visitId)]
    : [where('ownerId', '==', ownerId), where('visitId', '==', visitId)]

  const snap = await getDocs(query(col, ...constraints))
  return sortTasks(snap.docs.map((d) => mapTask(d.id, d.data())))
}

export async function listPendingTasks(
  ownerId: string,
  isAdmin: boolean,
): Promise<Task[]> {
  const constraints = isAdmin
    ? [where('status', 'in', ['backlog', 'in_progress'])]
    : [
        where('ownerId', '==', ownerId),
        where('status', 'in', ['backlog', 'in_progress']),
      ]

  const snap = await getDocs(query(col, ...constraints))
  return snap.docs
    .map((d) => mapTask(d.id, d.data()))
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
}

export async function createTask(
  ownerId: string,
  data: Omit<Task, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const ref = await addDoc(col, {
    visitId: data.visitId,
    title: data.title,
    status: data.status,
    order: data.order,
    dueDate: data.dueDate ?? null,
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function createTasksBatch(
  ownerId: string,
  visitId: string,
  titles: readonly string[],
): Promise<void> {
  const batch = writeBatch(db)
  titles.forEach((title, index) => {
    const ref = doc(col)
    batch.set(ref, {
      visitId,
      title,
      status: 'backlog',
      order: index,
      dueDate: null,
      ownerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  await batch.commit()
}

export async function updateTask(
  id: string,
  data: Partial<Omit<Task, 'id' | 'ownerId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(doc(col, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteTask(id: string): Promise<void> {
  await deleteDoc(doc(col, id))
}

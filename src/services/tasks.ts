import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getVisitChildDocs } from '@/lib/firestore-visit-query'
import { softDeleteEntity } from '@/services/trash'
import { listVisits } from '@/services/visits'
import type { PlaybookPhase, Task, TaskStatus, UserRole, Visit } from '@/types'

const col = collection(db, 'tasks')
const PHASES: PlaybookPhase[] = ['preparacao', 'durante', 'encerramento']

function mapTask(id: string, data: Record<string, unknown>): Task {
  const phase = PHASES.includes(data.phase as PlaybookPhase)
    ? (data.phase as PlaybookPhase)
    : undefined
  return {
    id,
    visitId: String(data.visitId ?? ''),
    title: String(data.title ?? ''),
    status: (data.status as TaskStatus) ?? 'backlog',
    order: Number(data.order ?? 0),
    dueDate: data.dueDate ? String(data.dueDate) : undefined,
    assigneeName: data.assigneeName ? String(data.assigneeName) : undefined,
    assigneeId: data.assigneeId ? String(data.assigneeId) : undefined,
    phase,
    ownerId: String(data.ownerId ?? ''),
    isDeleted: data.isDeleted === true,
    deletedAt: data.deletedAt,
    deletedBy: data.deletedBy ? String(data.deletedBy) : undefined,
    expiresAt: data.expiresAt,
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
  const tasks = await getVisitChildDocs(col, visitId, ownerId, isAdmin, (d) =>
    mapTask(d.id, d.data()),
  )
  return sortTasks(tasks.filter((task) => !task.isDeleted))
}

function sortPendingTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return a.title.localeCompare(b.title)
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    const byDue = a.dueDate.localeCompare(b.dueDate)
    if (byDue !== 0) return byDue
    return a.title.localeCompare(b.title)
  })
}

export async function listPendingTasks(
  orgId: string,
  userId: string,
  isPlatformAdmin: boolean,
  role: UserRole = 'user',
  visits?: Visit[],
): Promise<Task[]> {
  const visitList = visits ?? (await listVisits(orgId, userId, isPlatformAdmin, role))
  if (visitList.length === 0) return []

  const tasksPerVisit = await Promise.all(
    visitList.map((visit) => listTasks(visit.id, visit.ownerId, isPlatformAdmin)),
  )

  return sortPendingTasks(
    tasksPerVisit
      .flat()
      .filter((task) => task.status === 'backlog' || task.status === 'in_progress'),
  )
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
    assigneeName: data.assigneeName ?? null,
    assigneeId: data.assigneeId ?? null,
    phase: data.phase ?? null,
    ownerId,
    isDeleted: false,
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
  await createTasksDetailed(ownerId, visitId, titles.map((title, index) => ({
    title,
    status: 'backlog' as const,
    order: index,
  })))
}

export async function createTasksDetailed(
  ownerId: string,
  visitId: string,
  tasks: Array<{
    title: string
    status?: TaskStatus
    order: number
    dueDate?: string
    assigneeName?: string
    assigneeId?: string
    phase?: PlaybookPhase
  }>,
): Promise<void> {
  const CHUNK = 450
  for (let i = 0; i < tasks.length; i += CHUNK) {
    const chunk = tasks.slice(i, i + CHUNK)
    const batch = writeBatch(db)
    chunk.forEach((task) => {
      const ref = doc(col)
      batch.set(ref, {
        visitId,
        title: task.title,
        status: task.status ?? 'backlog',
        order: task.order,
        dueDate: task.dueDate ?? null,
        assigneeName: task.assigneeName ?? null,
        assigneeId: task.assigneeId ?? null,
        phase: task.phase ?? null,
        ownerId,
        isDeleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    })
    await batch.commit()
  }
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

export async function deleteTask(id: string, deletedBy: string): Promise<void> {
  await softDeleteEntity('task', id, deletedBy)
}

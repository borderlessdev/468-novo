import type { UserRole, Visit } from '@/types'

export function canWriteOperations(role: UserRole, isAdmin: boolean): boolean {
  if (isAdmin) return true
  return role !== 'client'
}

export function canDeleteVisit(
  role: UserRole,
  isAdmin: boolean,
  visit: Visit,
  uid: string,
): boolean {
  if (isAdmin) return true
  return role === 'user' && visit.ownerId === uid
}

export function canManageVisitAccess(
  role: UserRole,
  isAdmin: boolean,
  visit: Visit,
  uid: string,
): boolean {
  if (isAdmin) return true
  return visit.ownerId === uid && role === 'user'
}

export function clientNavPaths(): string[] {
  return ['/', '/visitas', '/agenda', '/configuracoes']
}

export function isNavAllowed(path: string, role: UserRole, isAdmin: boolean): boolean {
  if (isAdmin || role !== 'client') return true
  return clientNavPaths().some(
    (allowed) => path === allowed || (allowed !== '/' && path.startsWith(allowed)),
  )
}

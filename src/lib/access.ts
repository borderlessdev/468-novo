import type { ModulePermissions, UserRole, Visit } from '@/types'

export const DEFAULT_MODULE_PERMISSIONS: ModulePermissions = {
  visitors: true,
  planning: true,
  finance: true,
  reports: true,
}

export function mergeModulePermissions(
  partial?: Partial<ModulePermissions> | null,
): ModulePermissions {
  return { ...DEFAULT_MODULE_PERMISSIONS, ...partial }
}

export function canWriteOperations(role: UserRole, isPlatformAdmin: boolean): boolean {
  if (isPlatformAdmin) return true
  return role !== 'client'
}

export function canManageOrgUsers(
  isPlatformAdmin: boolean,
  isOrgAdmin: boolean,
): boolean {
  return isPlatformAdmin || isOrgAdmin
}

export function canCreateOrganization(isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin
}

/**
 * Aprovação financeira (1 nível): owner da visita, admin, ou role user dono.
 * Equipe (team) e cliente NÃO aprovam.
 * Trade-off: rules do financeItem não distinguem team vs owner com precisão;
 * a validação fica na UI + service.
 */
export function canApproveFinance(
  role: UserRole,
  isAdmin: boolean,
  visit: Visit | null | undefined,
  uid: string,
): boolean {
  if (isAdmin) return true
  if (role === 'client' || role === 'team') return false
  if (!visit) return false
  return visit.ownerId === uid
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
  return ['/', '/visitas', '/programacao', '/assistente', '/ajuda', '/configuracoes']
}

const MODULE_PATH_PREFIX: { prefix: string; key: keyof ModulePermissions }[] = [
  { prefix: '/visitantes', key: 'visitors' },
  { prefix: '/planejamento', key: 'planning' },
  { prefix: '/financeiro', key: 'finance' },
  { prefix: '/relatorios', key: 'reports' },
]

export function isModuleAllowed(
  path: string,
  permissions: ModulePermissions,
  role: UserRole,
  isAdmin: boolean,
): boolean {
  if (isAdmin || role === 'client') return true
  const match = MODULE_PATH_PREFIX.find(
    (item) => path === item.prefix || path.startsWith(`${item.prefix}/`),
  )
  if (!match) return true
  return permissions[match.key] !== false
}

/** Rotas permitidas ao cliente. `/configuracoes` é exato (sem lixeira). */
export function isNavAllowed(
  path: string,
  role: UserRole,
  isAdmin: boolean,
  modulePermissions?: Partial<ModulePermissions> | null,
): boolean {
  if (path === '/empresas' || path.startsWith('/empresas/')) {
    return isAdmin
  }
  if (isAdmin) return true
  if (role === 'client') {
    if (path === '/') return true
    if (path === '/programacao' || path.startsWith('/programacao/')) return true
    if (path === '/agenda' || path.startsWith('/agenda/')) return true
    if (path === '/visitas' || path.startsWith('/visitas/')) return true
    if (
      path === '/assistente' ||
      path.startsWith('/assistente/') ||
      path === '/ajuda' ||
      path.startsWith('/ajuda/')
    ) {
      return true
    }
    if (path === '/configuracoes') return true
    return false
  }
  return isModuleAllowed(path, mergeModulePermissions(modulePermissions), role, isAdmin)
}

import type {
  ModulePermissions,
  UserRole,
  Visit,
  VisitEditableModule,
  VisitModuleEditorFlags,
} from '@/types'

export const VISIT_EDITABLE_MODULES: {
  key: VisitEditableModule
  label: string
}[] = [
  { key: 'planning', label: 'Planejamento' },
  { key: 'agenda', label: 'Programação' },
  { key: 'visitors', label: 'Visitantes' },
  { key: 'finance', label: 'Financeiro' },
]

export const DEFAULT_VISIT_MODULE_EDITOR_FLAGS: VisitModuleEditorFlags = {
  planning: true,
  agenda: true,
  visitors: true,
  finance: true,
}

export function mergeVisitModuleEditorFlags(
  partial?: Partial<VisitModuleEditorFlags> | null,
): VisitModuleEditorFlags {
  return { ...DEFAULT_VISIT_MODULE_EDITOR_FLAGS, ...partial }
}

export function hasAnyVisitModuleEdit(
  flags?: Partial<VisitModuleEditorFlags> | null,
): boolean {
  if (!flags) return false
  return VISIT_EDITABLE_MODULES.some(({ key }) => flags[key] === true)
}

/** IDs em teamMemberIds a partir dos editores com pelo menos um módulo liberado. */
export function teamMemberIdsFromModuleEditors(
  moduleEditors?: Record<string, Partial<VisitModuleEditorFlags>> | null,
): string[] {
  if (!moduleEditors) return []
  return Object.entries(moduleEditors)
    .filter(([, flags]) => hasAnyVisitModuleEdit(flags))
    .map(([uid]) => uid)
}

export const DEFAULT_MODULE_PERMISSIONS: ModulePermissions = {
  visitors: true,
  planning: true,
  finance: true,
  reports: true,
  revenue: false,
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

/** Convite de cliente: admin da plataforma, admin da empresa ou funcionário (equipe). */
export function canInviteClients(
  isPlatformAdmin: boolean,
  isOrgAdmin: boolean,
  role: UserRole,
): boolean {
  return canManageOrgUsers(isPlatformAdmin, isOrgAdmin) || role === 'team'
}

/** Whitelabel (logo da pasta): Admin Master e Admin da empresa. Funcionários só herdam. */
export function canManageWhitelabel(
  isPlatformAdmin: boolean,
  isOrgAdmin: boolean,
): boolean {
  return canManageOrgUsers(isPlatformAdmin, isOrgAdmin)
}

export function canCreateOrganization(isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin
}

/**
 * Aprovação financeira (1 nível): owner da visita, admin master, admin da empresa.
 * Equipe (team) e cliente NÃO aprovam.
 * Trade-off: rules do financeItem não distinguem team vs owner com precisão;
 * a validação fica na UI + service.
 */
export function canApproveFinance(
  role: UserRole,
  isAdmin: boolean,
  visit: Visit | null | undefined,
  uid: string,
  isOrgAdmin = false,
): boolean {
  if (isAdmin || isOrgAdmin) return true
  if (role === 'client' || role === 'team') return false
  if (!visit) return false
  return visit.ownerId === uid
}

export function canDeleteVisit(
  role: UserRole,
  isAdmin: boolean,
  visit: Visit,
  uid: string,
  isOrgAdmin = false,
): boolean {
  if (isAdmin || isOrgAdmin) return true
  return role === 'user' && visit.ownerId === uid
}

/** Quem pode liberar editores / clientes na visita. */
export function canManageVisitAccess(
  role: UserRole,
  isAdmin: boolean,
  visit: Visit,
  uid: string,
  isOrgAdmin = false,
): boolean {
  if (isAdmin || isOrgAdmin) return true
  if (role === 'client') return false
  return visit.ownerId === uid
}

/**
 * Edição de conteúdo da visita por módulo.
 * Dono, admin da empresa e master: todos os módulos.
 * Demais: só o que o criador liberou em `moduleEditors`.
 */
export function canEditVisitModule(
  visit: Visit | null | undefined,
  module: VisitEditableModule,
  uid: string,
  role: UserRole,
  isAdmin: boolean,
  isOrgAdmin = false,
): boolean {
  if (!visit || !uid || role === 'client') return false
  if (isAdmin || isOrgAdmin) return true
  if (visit.ownerId === uid) return true
  const editors = visit.moduleEditors
  if (editors && Object.keys(editors).length > 0) {
    return editors[uid]?.[module] === true
  }
  // Legado: visitas só com teamMemberIds, sem moduleEditors.
  return visit.teamMemberIds.includes(uid)
}

/** Qualquer módulo liberado (dados gerais da visita, documentos, portal). */
export function canEditVisitAnyModule(
  visit: Visit | null | undefined,
  uid: string,
  role: UserRole,
  isAdmin: boolean,
  isOrgAdmin = false,
): boolean {
  if (!visit || !uid || role === 'client') return false
  if (isAdmin || isOrgAdmin) return true
  if (visit.ownerId === uid) return true
  const editors = visit.moduleEditors
  if (editors && Object.keys(editors).length > 0) {
    return hasAnyVisitModuleEdit(editors[uid])
  }
  return visit.teamMemberIds.includes(uid)
}

/** Entrada do cliente após o login. As telas reais entram nestas rotas depois. */
export function clientHomePath(): string {
  return '/orcamento'
}

export function clientNavPaths(): string[] {
  return ['/orcamento', '/planejamento', '/perfil']
}

const MODULE_PATH_PREFIX: { prefix: string; key: keyof ModulePermissions }[] = [
  { prefix: '/crm', key: 'visitors' },
  { prefix: '/planejamento', key: 'planning' },
  { prefix: '/orcamento', key: 'finance' },
  { prefix: '/financeiro', key: 'finance' },
  { prefix: '/receitas', key: 'revenue' },
  { prefix: '/relatorios', key: 'reports' },
]

export function isModuleAllowed(
  path: string,
  permissions: ModulePermissions,
  role: UserRole,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true
  if (role === 'client') return false
  const match = MODULE_PATH_PREFIX.find(
    (item) => path === item.prefix || path.startsWith(`${item.prefix}/`),
  )
  if (!match) return true
  return permissions[match.key] !== false
}

/**
 * Gestão de Receitas: só Gestor de Recursos (permissão) ou Admin Master.
 * Admin da empresa libera a permissão; não entra automaticamente.
 */
export function canAccessRevenue(
  isPlatformAdmin: boolean,
  modulePermissions?: Partial<ModulePermissions> | null,
): boolean {
  if (isPlatformAdmin) return true
  return mergeModulePermissions(modulePermissions).revenue === true
}

/** Rotas permitidas ao cliente: Orçamento, Planejamento e o perfil do header. */
export function isNavAllowed(
  path: string,
  role: UserRole,
  isAdmin: boolean,
  modulePermissions?: Partial<ModulePermissions> | null,
  isOrgAdmin = false,
): boolean {
  if (path === '/orcamento' || path.startsWith('/orcamento/')) {
    if (!isAdmin && role === 'client') return true
    if (isAdmin || isOrgAdmin) return true
    return isModuleAllowed(path, mergeModulePermissions(modulePermissions), role, isAdmin)
  }
  if (path === '/empresas' || path.startsWith('/empresas/')) {
    return isAdmin || role === 'admin'
  }
  if (path === '/usuarios' || path.startsWith('/usuarios/')) {
    return canManageOrgUsers(isAdmin, isOrgAdmin)
  }
  if (path === '/receitas' || path.startsWith('/receitas/')) {
    return canAccessRevenue(isAdmin, modulePermissions)
  }
  if (isAdmin) return true
  if (role === 'client') {
    if (path === '/orcamento' || path.startsWith('/orcamento/')) return true
    if (path === '/planejamento' || path.startsWith('/planejamento/')) return true
    if (path === '/perfil') return true
    return false
  }
  return isModuleAllowed(path, mergeModulePermissions(modulePermissions), role, isAdmin)
}

import type { DashboardVariant, Organization } from '@/types'

/** Pasta VALE em produção (programa-visitas-72be9). */
export const VALE_ORG_ID = 'zMbsJRLVTObXNNSVJxES'

export function resolveDashboardVariant(
  org: Organization | null | undefined,
): DashboardVariant {
  if (!org) return 'default'
  if (org.dashboardVariant === 'vale') return 'vale'
  if (org.id === VALE_ORG_ID) return 'vale'
  if (org.name.trim().toUpperCase() === 'VALE') return 'vale'
  return 'default'
}

export function usesValeDashboard(org: Organization | null | undefined): boolean {
  return resolveDashboardVariant(org) === 'vale'
}

import type { InviteRole, OrgRole, UserRole } from '@/types'

export const ACTIVE_ORG_STORAGE_KEY = 'active-org-id'

export function organizationMemberId(orgId: string, uid: string) {
  return `${orgId}_${uid}`
}

export function inviteRoleToUserRole(role: InviteRole): UserRole {
  if (role === 'org_admin') return 'user'
  if (role === 'team' || role === 'client') return role
  return 'user'
}

export function inviteRoleToOrgRole(role: InviteRole): OrgRole {
  if (role === 'org_admin') return 'org_admin'
  if (role === 'team') return 'team'
  if (role === 'client') return 'client'
  return 'user'
}

export function orgRoleLabel(role: OrgRole): string {
  switch (role) {
    case 'org_admin':
      return 'Admin da empresa'
    case 'team':
      return 'Equipe'
    case 'client':
      return 'Cliente'
    default:
      return 'Usuário'
  }
}

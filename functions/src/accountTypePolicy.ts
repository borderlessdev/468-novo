export const ACCOUNT_TYPES = [
  'admin_master',
  'org_admin',
  'team',
  'user',
  'client',
] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]

export type ProfileRole = 'admin' | 'user' | 'team' | 'client'

export type OrgRole = 'org_admin' | 'user' | 'team' | 'client'

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(value)
}

export function profileRoleForAccountType(type: AccountType): ProfileRole {
  if (type === 'admin_master') return 'admin'
  if (type === 'team') return 'team'
  if (type === 'client') return 'client'
  return 'user'
}

/** Perfil de empresa. Administrador master não altera o vínculo existente. */
export function orgRoleForAccountType(type: AccountType): OrgRole | null {
  if (type === 'admin_master') return null
  return type
}

export interface ChangeDecisionInput {
  callerIsMaster: boolean
  targetExists: boolean
  targetIsMaster: boolean
  otherMasterCount: number
  currentType: AccountType
  nextType: AccountType
  hasOrganizationLink: boolean
}

export type ChangeDecision =
  | {
      ok: true
      unchanged: boolean
      profileRole: ProfileRole
      orgRole: OrgRole | null
      claims: 'grant' | 'revoke' | 'keep'
    }
  | {
      ok: false
      code: 'permission-denied' | 'not-found' | 'failed-precondition' | 'invalid-argument'
      message: string
    }

/**
 * Decide se a troca de tipo é permitida.
 * Só o administrador master altera tipos. O último master não pode ser rebaixado.
 * Perfis de empresa exigem vínculo já existente — a ação não cria nem apaga conta ou empresa.
 */
export function decideAccountTypeChange(input: ChangeDecisionInput): ChangeDecision {
  if (!input.callerIsMaster) {
    return {
      ok: false,
      code: 'permission-denied',
      message: 'Apenas o administrador master pode alterar o tipo de usuário.',
    }
  }
  if (!input.targetExists) {
    return { ok: false, code: 'not-found', message: 'Usuário não encontrado.' }
  }
  if (!isAccountType(input.nextType)) {
    return { ok: false, code: 'invalid-argument', message: 'Tipo de usuário inválido.' }
  }
  if (input.currentType === input.nextType) {
    return {
      ok: true,
      unchanged: true,
      profileRole: profileRoleForAccountType(input.currentType),
      orgRole: null,
      claims: 'keep',
    }
  }
  if (input.targetIsMaster && input.nextType !== 'admin_master' && input.otherMasterCount < 1) {
    return {
      ok: false,
      code: 'failed-precondition',
      message: 'O sistema precisa manter pelo menos um administrador master.',
    }
  }
  if (input.nextType !== 'admin_master' && !input.hasOrganizationLink) {
    return {
      ok: false,
      code: 'failed-precondition',
      message:
        'Este usuário não está vinculado a uma empresa. O vínculo precisa existir antes de definir um perfil da empresa.',
    }
  }

  const leavingMaster = input.targetIsMaster && input.nextType !== 'admin_master'
  const becomingMaster = input.nextType === 'admin_master'
  return {
    ok: true,
    unchanged: false,
    profileRole: profileRoleForAccountType(input.nextType),
    orgRole: orgRoleForAccountType(input.nextType),
    claims: becomingMaster ? 'grant' : leavingMaster ? 'revoke' : 'keep',
  }
}

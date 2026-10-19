export const ACCOUNT_TYPES = [
  'admin_master',
  'org_admin',
  'team',
  'user',
  'client',
] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'admin_master', label: 'Administrador master' },
  { value: 'org_admin', label: 'Administrador da empresa' },
  { value: 'team', label: 'Funcionário' },
  { value: 'user', label: 'Usuário' },
  { value: 'client', label: 'Cliente' },
]

export function accountTypeLabel(type: AccountType): string {
  return ACCOUNT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
}

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(value)
}

/** Tipo exibido: master prevalece sobre o papel na empresa. */
export function resolveDisplayedAccountType(
  profileRole: string | undefined,
  orgRole: string | undefined,
): AccountType {
  if (profileRole === 'admin') return 'admin_master'
  if (isAccountType(orgRole)) return orgRole
  if (profileRole === 'team' || profileRole === 'client' || profileRole === 'user') {
    return profileRole
  }
  return 'user'
}

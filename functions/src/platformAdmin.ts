export function hasPlatformAdminClaim(
  token: Record<string, unknown> | undefined,
): boolean {
  if (!token) return false
  return token.admin === true || token.platformAdmin === true || token.role === 'admin'
}

/**
 * Administrador master é a claim do token. O perfil `users.role` pode estar
 * dessincronizado (contas criadas antes do espelhamento) e não bloqueia o login.
 */
export async function callerIsPlatformAdmin(
  _uid: string,
  token: Record<string, unknown> | undefined,
): Promise<boolean> {
  void _uid
  return hasPlatformAdminClaim(token)
}

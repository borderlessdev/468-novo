const PENDING_INVITE_KEY = 'pe-pending-invite'

/** Guarda o token do convite para sobreviver a reset de senha / navegação. */
export function rememberInviteToken(token: string | null | undefined) {
  if (!token?.trim()) return
  try {
    sessionStorage.setItem(PENDING_INVITE_KEY, token.trim())
  } catch {
    // ignore
  }
}

export function getPendingInviteToken(): string | null {
  try {
    return sessionStorage.getItem(PENDING_INVITE_KEY)
  } catch {
    return null
  }
}

export function clearPendingInviteToken() {
  try {
    sessionStorage.removeItem(PENDING_INVITE_KEY)
  } catch {
    // ignore
  }
}

/** Preferência: token na URL; senão, o guardado na sessão. */
export function resolveInviteToken(fromUrl: string | null | undefined): string | null {
  const urlToken = fromUrl?.trim()
  if (urlToken) {
    rememberInviteToken(urlToken)
    return urlToken
  }
  return getPendingInviteToken()
}

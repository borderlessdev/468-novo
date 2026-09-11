/** Gera senha temporária legível (padrão: 8 caracteres). */
export function generatePassword(length = 8): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%'
  const all = upper + lower + digits + symbols
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)]!
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)]
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () =>
    pick(all),
  )
  return [...required, ...rest].sort(() => Math.random() - 0.5).join('')
}

/** Solicitantes da visita Vale (VPs + áreas) — cadastro e dashboard. */
export const VALE_VPS = [
  'VP - Sustentabilidade',
  'VP - Comercial Novos Neg.',
  'VP - Pessoas',
  'VP - Assuntos Jurídicos',
  'VP - Operações',
  'VP - Finanças e RI',
  'VP - Técnica',
  'Presidência',
  'Governança Corporativa',
  'DI. Comunicação',
  'DI. Rel. Institucionais',
] as const

export type ValeVp = (typeof VALE_VPS)[number]

export function isValeVp(value: unknown): value is ValeVp {
  return typeof value === 'string' && (VALE_VPS as readonly string[]).includes(value)
}

export function valeVpLabel(vp: string | undefined | null): string {
  if (!vp?.trim()) return 'Sem VP'
  return vp.trim()
}

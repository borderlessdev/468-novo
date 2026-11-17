/** Helpers de enumeração do Número da PV (por organização). */

export function normalizePvNumber(value: string | undefined | null): string {
  return (value ?? '').trim()
}

/** UUID gerado pelo create antigo — não entra na lista de PVs operacionais. */
export function isGeneratedPvToken(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  )
}

export function parsePvNumeric(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/** PVs distintas, legíveis, ordenadas (numéricas primeiro). */
export function collectDistinctPvNumbers(values: Array<string | undefined | null>): string[] {
  const set = new Set<string>()
  for (const raw of values) {
    const pv = normalizePvNumber(raw)
    if (!pv || isGeneratedPvToken(pv)) continue
    set.add(pv)
  }
  return [...set].sort((a, b) => {
    const na = parsePvNumeric(a)
    const nb = parsePvNumeric(b)
    if (na != null && nb != null) return na - nb
    if (na != null) return -1
    if (nb != null) return 1
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
  })
}

/** Próximo número sugerido a partir do maior PV numérico existente. */
export function suggestNextPvNumber(existing: string[]): string {
  let max = 0
  for (const pv of existing) {
    const n = parsePvNumeric(pv)
    if (n != null && n > max) max = n
  }
  return String(max + 1)
}

export function pvNumberExists(candidate: string, existing: string[]): boolean {
  const normalized = normalizePvNumber(candidate)
  if (!normalized) return false
  return existing.some((pv) => pv === normalized)
}

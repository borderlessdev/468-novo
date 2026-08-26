/**
 * Rate limit simples em memória por uid (instância da Function).
 * Suficiente para evitar spam acidental; não é global entre instâncias.
 */

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20

const buckets = new Map<string, { count: number; resetAt: number }>()

export function assertAiRateLimit(uid: string): void {
  const now = Date.now()
  const current = buckets.get(uid)
  if (!current || now >= current.resetAt) {
    buckets.set(uid, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  if (current.count >= MAX_PER_WINDOW) {
    const err = new Error('rate_limit_exceeded')
    ;(err as Error & { code: string }).code = 'resource-exhausted'
    throw err
  }
  current.count += 1
}

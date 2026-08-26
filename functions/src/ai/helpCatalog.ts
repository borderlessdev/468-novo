import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

let cached: string | null = null

/** Concatena todos os manuais Markdown de ai/help/*.md */
export function loadHelpCatalog(): string {
  if (cached) return cached
  const dir = join(__dirname, 'help')
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
  cached = files
    .map((name) => readFileSync(join(dir, name), 'utf8').trim())
    .join('\n\n---\n\n')
  return cached
}

#!/usr/bin/env node
/**
 * Publica apenas as Cloud Functions de IA.
 * Requer `functions/.env` com ANTHROPIC_API_KEY (não commitado).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const envPath = resolve(root, 'functions/.env')

if (!existsSync(envPath)) {
  console.error('Crie functions/.env a partir de functions/.env.example e defina ANTHROPIC_API_KEY.')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .flatMap((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return []
      const eq = trimmed.indexOf('=')
      if (eq <= 0) return []
      return [[trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim()]]
    }),
)

if (!env.ANTHROPIC_API_KEY?.trim()) {
  console.error('ANTHROPIC_API_KEY ausente em functions/.env')
  process.exit(1)
}

const names = [
  'askHelpAssistant',
  'mapProgrammingImport',
  'draftCommunication',
  'getAiStatus',
]

const result = spawnSync(
  'firebase',
  [
    'deploy',
    '--only',
    names.map((n) => `functions:${n}`).join(','),
    '--force',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      FUNCTIONS_DISCOVERY_TIMEOUT: process.env.FUNCTIONS_DISCOVERY_TIMEOUT ?? '60',
    },
  },
)

process.exit(result.status ?? 1)

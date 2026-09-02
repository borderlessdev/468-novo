/**
 * Configuração do assistente de IA (Claude / Anthropic por padrão).
 * Preencha `functions/.env` — veja `.env.example`.
 */

export type AiProviderName = 'openai' | 'anthropic' | 'mock'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

export function getAnthropicApiUrl(): string {
  return process.env.ANTHROPIC_BASE_URL?.trim() || ANTHROPIC_API_URL
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6'
}

export function getOpenAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
}

export function readAiProvider(): AiProviderName {
  const preferred = (process.env.AI_PROVIDER ?? 'anthropic').trim().toLowerCase()
  if (preferred === 'mock') return 'mock'

  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY?.trim())
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim())

  if (preferred === 'openai' && hasOpenAi) return 'openai'
  if (preferred === 'anthropic' && hasAnthropic) return 'anthropic'

  if (hasAnthropic) return 'anthropic'
  if (hasOpenAi) return 'openai'

  return 'mock'
}

export function isAiConfigured(): boolean {
  const provider = readAiProvider()
  if (provider === 'mock') return false
  if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY?.trim())
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

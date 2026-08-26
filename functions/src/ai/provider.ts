/**
 * Adapter de LLM (OpenAI / Anthropic) com fallback mock quando não há API key.
 * Chaves ficam só em functions/.env / Secret Manager — nunca no cliente.
 */

export type AiProviderName = 'openai' | 'anthropic' | 'mock'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionInput {
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  /** Pede JSON no retorno (quando o provider suportar). */
  json?: boolean
  temperature?: number
  maxTokens?: number
}

function readProvider(): AiProviderName {
  const raw = (process.env.AI_PROVIDER ?? '').trim().toLowerCase()
  if (raw === 'openai' || raw === 'anthropic') return raw
  if (process.env.OPENAI_API_KEY?.trim()) return 'openai'
  if (process.env.ANTHROPIC_API_KEY?.trim()) return 'anthropic'
  return 'mock'
}

export function getAiProviderName(): AiProviderName {
  return readProvider()
}

export function isAiMockMode(): boolean {
  return readProvider() === 'mock'
}

async function callOpenAi(input: ChatCompletionInput): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('OPENAI_API_KEY ausente')

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
  const body: Record<string, unknown> = {
    model,
    temperature: input.temperature ?? 0.3,
    max_tokens: input.maxTokens ?? 1200,
    messages: [
      { role: 'system', content: input.system },
      ...input.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  }
  if (input.json) body.response_format = { type: 'json_object' }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('OpenAI retornou resposta vazia')
  return content
}

async function callAnthropic(input: ChatCompletionInput): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new Error('ANTHROPIC_API_KEY ausente')

  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-5-haiku-latest'
  const body: Record<string, unknown> = {
    model,
    max_tokens: input.maxTokens ?? 1200,
    temperature: input.temperature ?? 0.3,
    system: input.system,
    messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }
  const text = data.content?.find((block) => block.type === 'text')?.text?.trim()
  if (!text) throw new Error('Anthropic retornou resposta vazia')
  return text
}

/**
 * Completação de chat. Em modo mock devolve um marcador especial
 * `MOCK:` + o system/user para o caller decidir o fallback local.
 */
export async function chatCompletion(input: ChatCompletionInput): Promise<{
  text: string
  provider: AiProviderName
}> {
  const provider = readProvider()
  if (provider === 'mock') {
    return { text: 'MOCK', provider: 'mock' }
  }
  if (provider === 'openai') {
    return { text: await callOpenAi(input), provider }
  }
  return { text: await callAnthropic(input), provider }
}

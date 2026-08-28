import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { chatCompletion, isAiMockMode } from './provider'
import { assertAiRateLimit } from './rateLimit'
import { loadHelpCatalog } from './helpCatalog'

interface AuthLike {
  uid: string
}

function requireUid(auth: AuthLike | undefined): string {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Faça login para usar o assistente.')
  return auth.uid
}

function enforceRateLimit(uid: string): void {
  try {
    assertAiRateLimit(uid)
  } catch {
    throw new HttpsError(
      'resource-exhausted',
      'Muitas solicitações ao assistente. Aguarde um minuto e tente de novo.',
    )
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n…[truncado]`
}

// --- Help assistant ---------------------------------------------------------

const HELP_SYSTEM = `Você é o assistente de ajuda do Promover Experience (app de gestão de visitas institucionais).
Responda SEMPRE em português do Brasil, de forma curta e objetiva (no máximo 8 linhas ou uma lista numerada).
Explique o caminho de UX: menu → tela → botões/passos.
Use APENAS o manual abaixo. Se a pergunta não estiver coberta, diga que não sabe e sugira onde olhar no app (ex.: Configurações).
Não invente botões, rotas ou recursos que não estejam no manual.
Não execute ações; apenas oriente.`

function mockHelpAnswer(message: string, route?: string): string {
  const q = message.toLowerCase()
  if (q.includes('agenda') || q.includes('compromisso') || q.includes('programa')) {
    return [
      'Para registrar um compromisso na agenda:',
      '1. Abra **Programação** no menu.',
      '2. Selecione a visita no filtro do topo.',
      '3. Clique em **Nova atividade**, preencha título, data e horários e salve.',
      route?.startsWith('/programacao') || route?.startsWith('/agenda')
        ? 'Você já está na Programação — escolha a visita e use Nova atividade.'
        : '',
    ]
      .filter(Boolean)
      .join('\n')
  }
  if (q.includes('playbook')) {
    return 'Playbooks ficam em **Configurações → Playbooks**. Crie o modelo e aplique no detalhe da visita com a data de início.'
  }
  if (q.includes('portal') || q.includes('convidad') || q.includes('visitante')) {
    return 'No detalhe da visita, seção **Portal do visitante**: gere o link, copie ou envie o QR. Cadastre visitantes em **Visitantes** e vincule à visita.'
  }
  if (q.includes('calendar') || q.includes('google')) {
    return 'Em **Configurações**, conecte o Google Calendar. Depois sincronize na **Programação**.'
  }
  return [
    'Posso ajudar com o caminho no app (agenda, visitas, playbooks, portal, financeiro…).',
    'Ex.: “Como importo a programação?” ou “Como gero o link do portal?”',
    route ? `Você está em: ${route}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const askHelpAssistant = onCall(async (request) => {
  const uid = requireUid(request.auth)
  enforceRateLimit(uid)

  const message = asString(request.data?.message).trim()
  if (!message) throw new HttpsError('invalid-argument', 'Informe a mensagem.')
  if (message.length > 2000) {
    throw new HttpsError('invalid-argument', 'Mensagem muito longa (máx. 2000 caracteres).')
  }

  const route = asString(request.data?.route).slice(0, 200) || undefined
  const rawHistory = Array.isArray(request.data?.history) ? request.data.history : []
  const history = rawHistory
    .slice(-8)
    .flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return []
      const row = item as Record<string, unknown>
      const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : null
      const content = asString(row.content).trim()
      if (!role || !content) return []
      return [{ role: role as 'user' | 'assistant', content: content.slice(0, 1500) }]
    })

  if (isAiMockMode()) {
    return { reply: mockHelpAnswer(message, route), provider: 'mock' as const }
  }

  const manual = loadHelpCatalog()
  const system = `${HELP_SYSTEM}\n\n## Manual do produto\n\n${manual}`
  const userPayload = [
    route ? `Rota atual do usuário: ${route}` : null,
    `Pergunta: ${message}`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { text, provider } = await chatCompletion({
      system,
      messages: [...history, { role: 'user', content: userPayload }],
      temperature: 0.2,
      maxTokens: 800,
    })
    return { reply: text, provider }
  } catch (error) {
    logger.error('askHelpAssistant failed', error)
    throw new HttpsError('internal', 'Não foi possível obter resposta do assistente.')
  }
})

// --- Programming import -----------------------------------------------------

export interface ImportedActivityDto {
  title: string
  description: string
  location: string
  date: string
  startTime: string
  endTime: string
  responsibleNames: string[]
  visitorNames: string[]
}

function mockMapImport(sheetCsv: string, fallbackYear: number): {
  activities: ImportedActivityDto[]
  warnings: string[]
} {
  const lines = sheetCsv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
  const activities: ImportedActivityDto[] = []
  const warnings: string[] = [
    'Modo mock (sem API key): gerando atividades de exemplo a partir das primeiras linhas.',
  ]

  for (let i = 0; i < Math.min(lines.length, 5); i += 1) {
    const cells = lines[i].split(/[,;\t]/).map((c) => c.trim()).filter(Boolean)
    const title = cells.find((c) => c.length > 3 && !/^\d/.test(c)) || `Atividade importada ${i + 1}`
    const day = String(10 + i).padStart(2, '0')
    const date = `${fallbackYear}-01-${day}`
    const startH = 9 + i
    const endH = startH + 1
    activities.push({
      title: title.slice(0, 120),
      description: '',
      location: '',
      date,
      startTime: `${date}T${String(startH).padStart(2, '0')}:00:00`,
      endTime: `${date}T${String(endH).padStart(2, '0')}:00:00`,
      responsibleNames: [],
      visitorNames: [],
    })
  }

  if (activities.length === 0) {
    warnings.push('Não foi possível extrair linhas no mock. Verifique o CSV enviado.')
  }
  return { activities, warnings }
}

function normalizeImported(raw: unknown): ImportedActivityDto | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const title = asString(data.title).trim()
  const date = asString(data.date).trim()
  let startTime = asString(data.startTime).trim()
  let endTime = asString(data.endTime).trim()
  if (!title || !date || !startTime || !endTime) return null
  if (/^\d{2}:\d{2}$/.test(startTime)) startTime = `${date}T${startTime}:00`
  if (/^\d{2}:\d{2}$/.test(endTime)) endTime = `${date}T${endTime}:00`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const toNames = (value: unknown) =>
    Array.isArray(value)
      ? value.map((v) => String(v).trim()).filter(Boolean)
      : asString(value)
          .split(/[,;]/)
          .map((n) => n.trim())
          .filter(Boolean)
  return {
    title,
    description: asString(data.description).trim(),
    location: asString(data.location).trim(),
    date,
    startTime,
    endTime,
    responsibleNames: toNames(data.responsibleNames),
    visitorNames: toNames(data.visitorNames),
  }
}

const IMPORT_SYSTEM = `Você extrai a programação de uma planilha (CSV) para o app Promover Experience.
Responda APENAS com JSON válido no formato:
{"activities":[{"title":"...","description":"","location":"","date":"YYYY-MM-DD","startTime":"YYYY-MM-DDTHH:mm:ss","endTime":"YYYY-MM-DDTHH:mm:ss","responsibleNames":[],"visitorNames":[]}],"warnings":["..."]}
Regras:
- date em YYYY-MM-DD; horários com o mesmo date no prefixo.
- endTime deve ser depois de startTime; se invertido, corrija e avise em warnings.
- Ignore linhas sem título ou sem horário.
- Se o ano estiver ausente, use o fallbackYear informado.
- Detecte possíveis conflitos entre atividades geradas (mesmo horário) e liste em warnings.
- Não invente atividades sem base no CSV.`

export const mapProgrammingImport = onCall(
  { timeoutSeconds: 120 },
  async (request) => {
    const uid = requireUid(request.auth)
    enforceRateLimit(uid)

    const sheetCsv = asString(request.data?.sheetCsv)
    if (!sheetCsv.trim()) throw new HttpsError('invalid-argument', 'Envie o conteúdo da planilha.')
    const capped = truncate(sheetCsv, 80_000)
    const fallbackYear =
      Number(request.data?.fallbackYear) || new Date().getFullYear()
    const headers = asString(request.data?.headers)
    const existing = Array.isArray(request.data?.existingActivities)
      ? request.data.existingActivities
      : []

    if (isAiMockMode()) {
      return { ...mockMapImport(capped, fallbackYear), provider: 'mock' as const }
    }

    const existingSummary = existing
      .slice(0, 40)
      .map((item: unknown) => {
        if (!item || typeof item !== 'object') return null
        const row = item as Record<string, unknown>
        return {
          title: asString(row.title),
          date: asString(row.date),
          startTime: asString(row.startTime),
          endTime: asString(row.endTime),
        }
      })
      .filter(Boolean)

    try {
      const { text, provider } = await chatCompletion({
        system: IMPORT_SYSTEM,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              fallbackYear,
              headers: headers || undefined,
              existingActivities: existingSummary,
              sheetCsv: capped,
            }),
          },
        ],
        json: true,
        temperature: 0.1,
        maxTokens: 4000,
      })

      let parsed: { activities?: unknown[]; warnings?: unknown[] }
      try {
        parsed = JSON.parse(text) as { activities?: unknown[]; warnings?: unknown[] }
      } catch {
        throw new HttpsError('internal', 'A IA retornou JSON inválido para o import.')
      }

      const activities = (parsed.activities ?? [])
        .map(normalizeImported)
        .filter((a): a is ImportedActivityDto => a != null)
      const warnings = (parsed.warnings ?? [])
        .map((w) => asString(w).trim())
        .filter(Boolean)

      if (activities.length === 0) {
        warnings.push('Nenhuma atividade válida foi extraída. Verifique o arquivo.')
      }

      return { activities, warnings, provider }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      logger.error('mapProgrammingImport failed', error)
      throw new HttpsError('internal', 'Não foi possível interpretar a planilha com IA.')
    }
  },
)

// --- Communication drafts ---------------------------------------------------

export type DraftKind = 'visit_summary' | 'internal_briefing' | 'guest_invite'

function mockDraft(kind: DraftKind, ctx: Record<string, unknown>): {
  subject?: string
  body: string
} {
  const title = asString(ctx.title) || 'Visita'
  const company = asString(ctx.company)
  const start = asString(ctx.startDate)
  const end = asString(ctx.endDate)
  const portalUrl = asString(ctx.portalUrl)
  const period = start && end ? `${start} a ${end}` : start || end || ''

  if (kind === 'guest_invite') {
    return {
      body: [
        `Olá! Segue o link do portal da visita "${title}"${company ? ` (${company})` : ''}.`,
        period ? `Período: ${period}.` : '',
        portalUrl || '[link do portal]',
        'Por favor confirme sua presença e revise seus dados.',
      ]
        .filter(Boolean)
        .join('\n'),
    }
  }

  if (kind === 'internal_briefing') {
    return {
      subject: `Briefing interno — ${title}`,
      body: [
        `Briefing: ${title}`,
        company ? `Empresa: ${company}` : '',
        period ? `Período: ${period}` : '',
        asString(ctx.objective) ? `Objetivo: ${asString(ctx.objective)}` : '',
        `Visitantes: ${Number(ctx.visitorCount) || 0} · Tarefas pendentes: ${Number(ctx.pendingTasks) || 0}`,
        'Pontos de atenção: revisar programação, documentos e financeiro antes do início.',
      ]
        .filter(Boolean)
        .join('\n'),
    }
  }

  return {
    subject: `Resumo da visita: ${title}`,
    body: [
      `Visita: ${title}`,
      company ? `Empresa: ${company}` : '',
      period ? `Período: ${period}` : '',
      asString(ctx.status) ? `Status: ${asString(ctx.status)}` : '',
      asString(ctx.objective) ? `Objetivo: ${asString(ctx.objective)}` : '',
      `Visitantes: ${Number(ctx.visitorCount) || 0}`,
      `Tarefas pendentes: ${Number(ctx.pendingTasks) || 0}`,
      ctx.financeTotal != null ? `Total financeiro: ${asString(ctx.financeTotal)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

const DRAFT_SYSTEM = `Você redige comunicações curtas em português do Brasil para o app Promover Experience.
Responda APENAS JSON: {"subject":"...","body":"..."} (subject opcional para guest_invite).
Tom profissional e objetivo. Não invente dados que não estejam no contexto.
Para guest_invite, inclua a URL do portal se fornecida. Não invente URLs.`

export const draftCommunication = onCall(async (request) => {
  const uid = requireUid(request.auth)
  enforceRateLimit(uid)

  const kind = asString(request.data?.kind) as DraftKind
  if (!['visit_summary', 'internal_briefing', 'guest_invite'].includes(kind)) {
    throw new HttpsError('invalid-argument', 'kind inválido.')
  }

  const visitContext =
    request.data?.visitContext && typeof request.data.visitContext === 'object'
      ? (request.data.visitContext as Record<string, unknown>)
      : {}
  const tone = asString(request.data?.tone).slice(0, 80)

  // Nunca logar tokens crus do portal
  const safeCtx = { ...visitContext }
  if (typeof safeCtx.portalUrl === 'string') {
    safeCtx.portalUrl = safeCtx.portalUrl.replace(/\/portal\/[^/?#]+/i, '/portal/[token]')
  }

  if (isAiMockMode()) {
    const draft = mockDraft(kind, visitContext)
    return { ...draft, provider: 'mock' as const }
  }

  try {
    const { text, provider } = await chatCompletion({
      system: DRAFT_SYSTEM,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ kind, tone: tone || undefined, visitContext: safeCtx }),
        },
      ],
      json: true,
      temperature: 0.4,
      maxTokens: 1000,
    })

    let parsed: { subject?: string; body?: string }
    try {
      parsed = JSON.parse(text) as { subject?: string; body?: string }
    } catch {
      throw new HttpsError('internal', 'A IA retornou JSON inválido para o rascunho.')
    }

    const body = asString(parsed.body).trim()
    if (!body) throw new HttpsError('internal', 'Rascunho vazio.')

    let finalBody = body
    const realUrl = asString(visitContext.portalUrl)
    if (kind === 'guest_invite' && realUrl) {
      finalBody = finalBody
        .replace(/\[link do portal\]/gi, realUrl)
        .replace(/https?:\/\/[^\s]*\/portal\/\[token\]/gi, realUrl)
      if (!finalBody.includes(realUrl)) {
        finalBody = `${finalBody.trim()}\n\n${realUrl}`
      }
    }

    return {
      subject: asString(parsed.subject).trim() || undefined,
      body: finalBody,
      provider,
    }
  } catch (error) {
    if (error instanceof HttpsError) throw error
    logger.error('draftCommunication failed', error)
    throw new HttpsError('internal', 'Não foi possível gerar o rascunho.')
  }
})

import { FirebaseError } from 'firebase/app'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import type { ImportedActivity } from '@/lib/programmingImport'

export type AiProviderLabel = 'openai' | 'anthropic' | 'mock'

export interface HelpChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AskHelpResult {
  reply: string
  provider: AiProviderLabel
}

export interface MapImportResult {
  activities: ImportedActivity[]
  warnings: string[]
  provider: AiProviderLabel
}

export type DraftKind = 'visit_summary' | 'internal_briefing' | 'guest_invite'

export interface VisitDraftContext {
  title?: string
  company?: string
  startDate?: string
  endDate?: string
  status?: string
  objective?: string
  visitorCount?: number
  pendingTasks?: number
  financeTotal?: string
  portalUrl?: string
  visitorName?: string
}

export interface DraftResult {
  subject?: string
  body: string
  provider: AiProviderLabel
}

const callAsk = httpsCallable<
  { message: string; route?: string; history?: HelpChatMessage[] },
  AskHelpResult
>(functions, 'askHelpAssistant')

const callMapImport = httpsCallable<
  {
    sheetCsv: string
    headers?: string
    fallbackYear: number
    existingActivities?: Array<{
      title: string
      date: string
      startTime: string
      endTime: string
    }>
  },
  MapImportResult
>(functions, 'mapProgrammingImport')

const callDraft = httpsCallable<
  { kind: DraftKind; visitContext: VisitDraftContext; tone?: string },
  DraftResult
>(functions, 'draftCommunication')

function messageOf(error: unknown): string {
  if (error instanceof FirebaseError) return error.message
  if (error instanceof Error) return error.message
  return 'Falha ao chamar o assistente'
}

export async function askHelpAssistant(input: {
  message: string
  route?: string
  history?: HelpChatMessage[]
}): Promise<AskHelpResult> {
  try {
    const { data } = await callAsk(input)
    return {
      reply: data.reply,
      provider: data.provider ?? 'mock',
    }
  } catch (error) {
    throw new Error(messageOf(error))
  }
}

export async function mapProgrammingImportWithAi(input: {
  sheetCsv: string
  headers?: string
  fallbackYear: number
  existingActivities?: Array<{
    title: string
    date: string
    startTime: string
    endTime: string
  }>
}): Promise<MapImportResult> {
  try {
    const { data } = await callMapImport(input)
    return {
      activities: data.activities ?? [],
      warnings: data.warnings ?? [],
      provider: data.provider ?? 'mock',
    }
  } catch (error) {
    throw new Error(messageOf(error))
  }
}

export async function draftCommunication(input: {
  kind: DraftKind
  visitContext: VisitDraftContext
  tone?: string
}): Promise<DraftResult> {
  try {
    const { data } = await callDraft(input)
    if (!data.body?.trim()) throw new Error('Rascunho vazio')
    return {
      subject: data.subject,
      body: data.body,
      provider: data.provider ?? 'mock',
    }
  } catch (error) {
    throw new Error(messageOf(error))
  }
}

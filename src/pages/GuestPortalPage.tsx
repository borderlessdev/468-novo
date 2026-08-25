import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format, isValid, parseISO } from 'date-fns'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Link2Off,
  MapPin,
  Star,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/shared/PageHeader'
import { formatDate } from '@/lib/utils'
import {
  buildGuestPortalUrl,
  getGuestLinkAvailability,
  getGuestLinkByToken,
  updateGuestPortal,
} from '@/services/visitGuestLinks'
import { submitFeedback } from '@/services/visitFeedbacks'
import type {
  GuestAgendaItem,
  GuestConfirmationStatus,
  GuestVisitorDraft,
  VisitGuestLink,
} from '@/types'

type PortalState = 'loading' | 'ok' | 'invalid' | 'expired' | 'revoked'

interface DraftForm {
  name: string
  document: string
  company: string
  role: string
  dietaryRestriction: string
  language: string
  notes: string
  mobilityReduced: boolean
}

const EMPTY_DRAFT: DraftForm = {
  name: '',
  document: '',
  company: '',
  role: '',
  dietaryRestriction: '',
  language: '',
  notes: '',
  mobilityReduced: false,
}

const RATINGS = [1, 2, 3, 4, 5]

const INVALID_LINK_COPY: Record<
  'invalid' | 'expired' | 'revoked',
  { title: string; description: string }
> = {
  invalid: {
    title: 'Link não encontrado',
    description:
      'Confira o endereço recebido ou peça um novo link para a organização da visita.',
  },
  expired: {
    title: 'Link expirado',
    description:
      'Este convite passou da validade. Solicite um novo link para a organização da visita.',
  },
  revoked: {
    title: 'Link cancelado',
    description:
      'Este convite foi cancelado pela organização. Entre em contato para receber um novo link.',
  },
}

function feedbackStorageKey(token: string): string {
  return `promover:portal-feedback:${token}`
}

function readFeedbackSent(token: string): boolean {
  try {
    return window.localStorage.getItem(feedbackStorageKey(token)) === 'sent'
  } catch {
    return false
  }
}

function markFeedbackSent(token: string): void {
  try {
    window.localStorage.setItem(feedbackStorageKey(token), 'sent')
  } catch {
    // modo privado / storage bloqueado: dedupe fica só nas regras
  }
}

/** As atividades gravam horário como ISO ou como "HH:mm". */
function formatAgendaTime(value: string): string {
  if (!value) return ''
  if (value.includes('T')) {
    const date = parseISO(value)
    return isValid(date) ? format(date, 'HH:mm') : ''
  }
  return value.slice(0, 5)
}

function groupAgendaByDate(
  agenda: GuestAgendaItem[],
): { date: string; items: GuestAgendaItem[] }[] {
  const byDate = new Map<string, GuestAgendaItem[]>()
  agenda.forEach((item) => {
    const current = byDate.get(item.date) ?? []
    current.push(item)
    byDate.set(item.date, current)
  })
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }))
}

function draftFromLink(link: VisitGuestLink): DraftForm {
  const draft = link.visitorDraft
  return {
    name: draft?.name ?? link.visitorName ?? '',
    document: draft?.document ?? '',
    company: draft?.company ?? link.company ?? '',
    role: draft?.role ?? '',
    dietaryRestriction: draft?.dietaryRestriction ?? '',
    language: draft?.language ?? '',
    notes: draft?.notes ?? '',
    mobilityReduced: draft?.mobilityReduced === true,
  }
}

function ConfirmationBadge({ status }: { status: GuestConfirmationStatus }) {
  if (status === 'confirmed') return <Badge variant="success">Presença confirmada</Badge>
  if (status === 'declined') return <Badge variant="warning">Presença recusada</Badge>
  return <Badge variant="muted">Aguardando confirmação</Badge>
}

function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl space-y-6">{children}</div>
    </div>
  )
}

export function GuestPortalPage({ mode = 'portal' }: { mode?: 'portal' | 'badge' }) {
  const { token = '' } = useParams<{ token: string }>()
  const [state, setState] = useState<PortalState>('loading')
  const [link, setLink] = useState<VisitGuestLink | null>(null)
  const [draft, setDraft] = useState<DraftForm>(EMPTY_DRAFT)
  const [savingDraft, setSavingDraft] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [sendingFeedback, setSendingFeedback] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)

  const portalUrl = useMemo(() => buildGuestPortalUrl(token), [token])

  const load = useCallback(async () => {
    if (!token) {
      setState('invalid')
      return
    }
    setState('loading')
    const found = await getGuestLinkByToken(token)
    if (!found) {
      setState('invalid')
      return
    }
    const availability = getGuestLinkAvailability(found)
    if (availability !== 'ok') {
      setLink(found)
      setState(availability)
      return
    }
    setLink(found)
    setDraft(draftFromLink(found))
    setFeedbackSent(readFeedbackSent(token))
    setState('ok')
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const agendaByDate = useMemo(
    () => groupAgendaByDate(link?.agenda ?? []),
    [link?.agenda],
  )

  const handleConfirmation = async (status: GuestConfirmationStatus) => {
    if (!link) return
    setConfirming(true)
    try {
      await updateGuestPortal(link.id, { confirmationStatus: status })
      setLink({ ...link, confirmationStatus: status })
      toast.success(
        status === 'confirmed' ? 'Presença confirmada. Obrigado!' : 'Recusa registrada',
      )
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível registrar sua resposta')
    } finally {
      setConfirming(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!link) return
    setSavingDraft(true)
    try {
      const payload: GuestVisitorDraft = {
        name: draft.name,
        document: draft.document,
        company: draft.company,
        role: draft.role,
        dietaryRestriction: draft.dietaryRestriction,
        language: draft.language,
        notes: draft.notes,
        mobilityReduced: draft.mobilityReduced,
      }
      await updateGuestPortal(link.id, { visitorDraft: payload })
      toast.success('Dados enviados para a organização')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível enviar seus dados')
    } finally {
      setSavingDraft(false)
    }
  }

  const handleSendFeedback = async () => {
    if (!link || rating === 0) return
    setSendingFeedback(true)
    try {
      await submitFeedback({
        visitId: link.visitId,
        guestLinkId: link.id,
        visitorId: link.visitorId,
        rating,
        comment,
        token: link.token,
      })
      markFeedbackSent(token)
      setFeedbackSent(true)
      toast.success('Obrigado pela avaliação!')
    } catch (error) {
      console.error(error)
      markFeedbackSent(token)
      setFeedbackSent(true)
      toast.error('Uma avaliação já foi enviada para este link')
    } finally {
      setSendingFeedback(false)
    }
  }

  if (state === 'loading') {
    return (
      <PortalShell>
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </PortalShell>
    )
  }

  if (state !== 'ok' || !link) {
    const copy = INVALID_LINK_COPY[state === 'ok' ? 'invalid' : state]

    return (
      <PortalShell>
        <Card>
          <CardContent className="pt-5">
            <EmptyState icon={Link2Off} title={copy.title} description={copy.description} />
          </CardContent>
        </Card>
      </PortalShell>
    )
  }

  const period = `${formatDate(link.startDate)} — ${formatDate(link.endDate)}`

  if (mode === 'badge') {
    return (
      <PortalShell>
        <Card className="overflow-hidden">
          <div className="bg-primary px-6 py-4 text-primary-foreground">
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">
              Crachá do visitante
            </p>
            <p className="font-display text-lg font-semibold">{link.visitTitle}</p>
          </div>
          <CardContent className="space-y-6 pt-6">
            <div>
              <p className="font-display text-2xl font-semibold text-foreground">
                {link.visitorName}
              </p>
              {link.company ? (
                <p className="text-sm text-muted-foreground">{link.company}</p>
              ) : null}
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Período</dt>
                <dd className="font-medium">{period}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Local</dt>
                <dd className="font-medium">{link.city || '—'}</dd>
              </div>
            </dl>
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-5">
              <QRCodeSVG value={portalUrl} size={168} level="M" />
              <p className="text-center text-xs text-muted-foreground">
                Aponte a câmera para abrir o portal da visita
              </p>
            </div>
            <div className="flex justify-center">
              <ConfirmationBadge status={link.confirmationStatus} />
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-center">
          <Button variant="outline" asChild>
            <Link to={`/portal/${token}`}>Voltar ao portal</Link>
          </Button>
        </div>
      </PortalShell>
    )
  }

  return (
    <PortalShell>
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">
          Portal do visitante
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {link.visitTitle}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            {period}
          </span>
          {link.city ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {link.city}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-foreground">
          Olá, <span className="font-medium">{link.visitorName}</span>
          {link.company ? ` · ${link.company}` : ''}
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Confirmação de presença</CardTitle>
          <ConfirmationBadge status={link.confirmationStatus} />
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="sm:w-auto"
            disabled={confirming || link.confirmationStatus === 'confirmed'}
            onClick={() => void handleConfirmation('confirmed')}
          >
            <CheckCircle2 className="h-4 w-4" />
            Confirmar presença
          </Button>
          <Button
            variant="outline"
            className="sm:w-auto"
            disabled={confirming || link.confirmationStatus === 'declined'}
            onClick={() => void handleConfirmation('declined')}
          >
            <XCircle className="h-4 w-4" />
            Não vou participar
          </Button>
        </CardContent>
      </Card>

      {link.arrivalInstructions ? (
        <Card>
          <CardHeader>
            <CardTitle>Instruções de chegada</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
              {link.arrivalInstructions}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Programação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {agendaByDate.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              A programação ainda está sendo finalizada. Volte a consultar este link.
            </p>
          ) : (
            agendaByDate.map((group) => (
              <div key={group.date} className="space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  {formatDate(group.date)}
                </p>
                <ul className="space-y-2">
                  {group.items.map((item, index) => (
                    <li
                      key={`${group.date}-${index}`}
                      className="flex gap-3 rounded-lg border px-3 py-2 text-sm"
                    >
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {formatAgendaTime(item.startTime)}
                        {item.endTime ? `–${formatAgendaTime(item.endTime)}` : ''}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium">{item.title}</p>
                        {item.location ? (
                          <p className="text-xs text-muted-foreground">{item.location}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seus dados</CardTitle>
          <p className="text-sm text-muted-foreground">
            Revise as informações abaixo. A organização recebe suas alterações e aplica no
            cadastro da visita.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="portal-name">Nome completo</Label>
              <Input
                id="portal-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-document">Documento</Label>
              <Input
                id="portal-document"
                value={draft.document}
                onChange={(e) => setDraft({ ...draft, document: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-company">Empresa</Label>
              <Input
                id="portal-company"
                value={draft.company}
                onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-role">Cargo</Label>
              <Input
                id="portal-role"
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-diet">Restrição alimentar</Label>
              <Input
                id="portal-diet"
                value={draft.dietaryRestriction}
                onChange={(e) =>
                  setDraft({ ...draft, dietaryRestriction: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-language">Idioma</Label>
              <Input
                id="portal-language"
                placeholder="Português, Inglês..."
                value={draft.language}
                onChange={(e) => setDraft({ ...draft, language: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-notes">Observações</Label>
            <Textarea
              id="portal-notes"
              rows={3}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={draft.mobilityReduced}
              onCheckedChange={(checked) =>
                setDraft({ ...draft, mobilityReduced: checked === true })
              }
            />
            Preciso de apoio de mobilidade reduzida
          </label>
          <Button disabled={savingDraft} onClick={() => void handleSaveDraft()}>
            {savingDraft ? 'Enviando...' : 'Enviar meus dados'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avalie a experiência</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sua nota ajuda a melhorar as próximas visitas.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {feedbackSent ? (
            <p className="text-sm text-muted-foreground">
              Avaliação registrada. Obrigado pelo retorno!
            </p>
          ) : (
            <>
              <div className="flex gap-1">
                {RATINGS.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="icon"
                    variant={value <= rating ? 'default' : 'outline'}
                    aria-label={`Nota ${value}`}
                    onClick={() => setRating(value)}
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                ))}
              </div>
              <Textarea
                rows={3}
                placeholder="Comentário (opcional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button
                disabled={sendingFeedback || rating === 0}
                onClick={() => void handleSendFeedback()}
              >
                {sendingFeedback ? 'Enviando...' : 'Enviar avaliação'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Crachá e acesso rápido</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="rounded-xl border border-dashed p-3">
            <QRCodeSVG value={portalUrl} size={112} level="M" />
          </div>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Guarde este QR code para abrir o portal rapidamente na recepção.
            </p>
            <Button variant="outline" asChild>
              <Link to={`/portal/${token}/cracha`}>
                <BadgeCheck className="h-4 w-4" />
                Ver meu crachá
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="pb-4 text-center text-xs text-muted-foreground">
        Link válido até {formatDate(link.expiresAt.slice(0, 10))} · Promover Experience
      </p>
    </PortalShell>
  )
}

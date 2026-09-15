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
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/shared/PageHeader'
import { VisitorProfileFields } from '@/features/visitors/VisitorProfileFields'
import {
  portalIntroCopy,
  resolveVisitorFormVariant,
  t,
  type PortalLocale,
} from '@/features/visitors/visitorFormConfig'
import {
  draftToProfileForm,
  mergeProfilePatch,
  profileFormToDraft,
  EMPTY_VISITOR_PROFILE,
  type VisitorProfileFormValues,
} from '@/features/visitors/visitorProfileModel'
import { formatDate } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  buildGuestPortalUrl,
  getGuestDrafts,
  getGuestLinkAvailability,
  getGuestLinkByToken,
  isVisitIntakeLink,
  updateGuestPortal,
} from '@/services/visitGuestLinks'
import {
  guestLookupVisitorByName,
  lookupResultToProfileForm,
} from '@/services/guestLookup'
import { submitFeedback } from '@/services/visitFeedbacks'
import type {
  GuestAgendaItem,
  GuestConfirmationStatus,
  GuestVisitorDraft,
  VisitGuestLink,
  VisitorFormVariant,
} from '@/types'

type PortalState = 'loading' | 'ok' | 'invalid' | 'expired' | 'revoked'

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

function draftFromLink(link: VisitGuestLink): VisitorProfileFormValues[] {
  const drafts = getGuestDrafts(link)
  if (drafts.length > 0) {
    return drafts.map((draft) =>
      draftToProfileForm(draft, {
        name: draft.name ?? link.visitorName,
        company: draft.company ?? link.company,
      }),
    )
  }
  return [
    draftToProfileForm(undefined, {
      name: link.visitorName,
      company: link.company,
    }),
  ]
}

function toDraftPayload(draft: VisitorProfileFormValues): GuestVisitorDraft {
  return profileFormToDraft(draft)
}

function linkFormVariant(link: VisitGuestLink): VisitorFormVariant {
  return link.formVariant ?? resolveVisitorFormVariant(link.eventKind)
}

function ConfirmationBadge({
  status,
  locale,
}: {
  status: GuestConfirmationStatus
  locale: PortalLocale
}) {
  if (status === 'confirmed') {
    return (
      <Badge variant="success">
        {locale === 'en' ? 'Attendance confirmed' : 'Presença confirmada'}
      </Badge>
    )
  }
  if (status === 'declined') {
    return (
      <Badge variant="warning">
        {locale === 'en' ? 'Attendance declined' : 'Presença recusada'}
      </Badge>
    )
  }
  return (
    <Badge variant="muted">
      {locale === 'en' ? 'Awaiting confirmation' : 'Aguardando confirmação'}
    </Badge>
  )
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
  const [drafts, setDrafts] = useState<VisitorProfileFormValues[]>([
    EMPTY_VISITOR_PROFILE,
  ])
  const [locale, setLocale] = useState<PortalLocale>('pt')
  const [lookupName, setLookupName] = useState('')
  const [lookupIndex, setLookupIndex] = useState(0)
  const [lookingUp, setLookingUp] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [sendingFeedback, setSendingFeedback] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)

  const portalUrl = useMemo(() => buildGuestPortalUrl(token), [token])
  const formVariant = link ? linkFormVariant(link) : 'geral'
  const intro = portalIntroCopy[formVariant]
  const isIntake = link ? isVisitIntakeLink(link) : false
  const primaryDraft = drafts[0] ?? EMPTY_VISITOR_PROFILE
  const lgpdOk = drafts.every((item) => item.lgpdConsent)

  const patchDraft = (index: number, patch: Partial<VisitorProfileFormValues>) => {
    setDrafts((prev) =>
      prev.map((item, i) => (i === index ? mergeProfilePatch(item, patch) : item)),
    )
  }

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
    const loaded = draftFromLink(found)
    setDrafts(loaded)
    setLookupName(loaded[0]?.name ?? '')
    setFeedbackSent(readFeedbackSent(token))
    setState('ok')
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!link || state !== 'ok') return
    const brand = link.orgName?.trim()
    document.title = brand
      ? `${link.visitTitle} · ${brand}`
      : `${link.visitTitle} · Portal do visitante`
    return () => {
      document.title = 'Promover Experience'
    }
  }, [link, state])

  const agendaByDate = useMemo(
    () => groupAgendaByDate(link?.agenda ?? []),
    [link?.agenda],
  )

  const handleConfirmation = async (status: GuestConfirmationStatus) => {
    if (!link) return
    if (status === 'confirmed' && !lgpdOk) {
      toast.error(
        locale === 'en'
          ? 'To confirm, please accept the use of your data for this event (privacy consent).'
          : 'Para confirmar, aceite o uso dos seus dados neste evento (LGPD).',
      )
      return
    }
    setConfirming(true)
    try {
      const payloads = drafts.map((item) => toDraftPayload(item))
      await updateGuestPortal(link.id, {
        confirmationStatus: status,
        visitorDrafts: payloads,
        visitorDraft: payloads[0],
      })
      const stamped = payloads.map((item) => ({
        ...item,
        updatedAt: new Date().toISOString(),
      }))
      setLink({
        ...link,
        confirmationStatus: status,
        visitorDraft: stamped[0],
        visitorDrafts: stamped,
      })
      toast.success(
        status === 'confirmed'
          ? locale === 'en'
            ? 'Attendance confirmed. Thank you!'
            : 'Presença confirmada. Obrigado!'
          : locale === 'en'
            ? 'Decline recorded'
            : 'Recusa registrada',
      )
    } catch (error) {
      console.error(error)
      toast.error(
        locale === 'en'
          ? 'Could not save your response'
          : 'Não foi possível registrar sua resposta',
      )
    } finally {
      setConfirming(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!link) return
    if (!lgpdOk) {
      toast.error(
        locale === 'en'
          ? 'Please accept the privacy consent before sending your details.'
          : 'Aceite o termo LGPD antes de enviar seus dados.',
      )
      return
    }
    for (let i = 0; i < drafts.length; i += 1) {
      if (!drafts[i].name.trim() || !drafts[i].document.trim()) {
        toast.error(
          locale === 'en'
            ? `Visitor ${i + 1}: name and document are required.`
            : `Visitante ${i + 1}: nome e documento são obrigatórios.`,
        )
        return
      }
    }
    setSavingDraft(true)
    try {
      const payloads = drafts.map((item) => toDraftPayload(item))
      await updateGuestPortal(link.id, {
        visitorDrafts: payloads,
        visitorDraft: payloads[0],
      })
      const stamped = payloads.map((item) => ({
        ...item,
        updatedAt: new Date().toISOString(),
      }))
      setLink({
        ...link,
        visitorDraft: stamped[0],
        visitorDrafts: stamped,
      })
      toast.success(
        locale === 'en'
          ? 'Details sent to the organization'
          : 'Dados enviados para a organização',
      )
    } catch (error) {
      console.error(error)
      toast.error(
        locale === 'en'
          ? 'Could not send your details'
          : 'Não foi possível enviar seus dados',
      )
    } finally {
      setSavingDraft(false)
    }
  }

  const handleLookup = async (index: number) => {
    if (!link) return
    const name = (index === 0 ? lookupName : drafts[index]?.name)?.trim()
    if (!name || name.length < 3) {
      toast.error(
        locale === 'en'
          ? 'Enter the full name to search.'
          : 'Informe o nome completo para buscar.',
      )
      return
    }
    setLookingUp(true)
    setLookupIndex(index)
    try {
      const result = await guestLookupVisitorByName(link.token, name)
      const form = lookupResultToProfileForm(result, name)
      if (!form) {
        toast.message(t('lookupNotFound', locale))
        return
      }
      patchDraft(index, { ...form, lgpdConsent: drafts[index]?.lgpdConsent === true })
      toast.success(t('lookupFound', locale))
    } catch (error) {
      console.error(error)
      toast.error(
        error instanceof Error
          ? error.message
          : locale === 'en'
            ? 'Lookup unavailable right now'
            : 'Busca indisponível no momento',
      )
    } finally {
      setLookingUp(false)
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide opacity-80">
                  Crachá do visitante
                </p>
                <p className="font-display text-lg font-semibold">{link.visitTitle}</p>
              </div>
              {link.orgLogoUrl ? (
                <img
                  src={link.orgLogoUrl}
                  alt=""
                  className="h-10 w-auto max-w-[96px] rounded bg-white/95 object-contain p-1"
                />
              ) : null}
            </div>
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
              <ConfirmationBadge status={link.confirmationStatus} locale={locale} />
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
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              {link.orgName || (locale === 'en' ? 'Guest portal' : 'Portal do visitante')}
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {link.visitTitle}
            </h1>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {link.orgLogoUrl ? (
              <img
                src={link.orgLogoUrl}
                alt={link.orgName ? `Logo ${link.orgName}` : 'Logo da empresa'}
                className="h-12 w-auto max-w-[140px] object-contain sm:h-14 sm:max-w-[180px]"
              />
            ) : null}
            <div className="flex rounded-lg border bg-background p-0.5 text-xs">
              <Button
                type="button"
                size="sm"
                variant={locale === 'pt' ? 'secondary' : 'ghost'}
                className="h-7 px-2"
                onClick={() => setLocale('pt')}
              >
                PT
              </Button>
              <Button
                type="button"
                size="sm"
                variant={locale === 'en' ? 'secondary' : 'ghost'}
                className="h-7 px-2"
                onClick={() => setLocale('en')}
              >
                EN
              </Button>
            </div>
          </div>
        </div>
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
          {locale === 'en' ? 'Hello,' : 'Olá,'}{' '}
          <span className="font-medium">
            {primaryDraft.name || link.visitorName}
          </span>
          {primaryDraft.company || link.company
            ? ` · ${primaryDraft.company || link.company}`
            : ''}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{intro.title[locale]}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {intro.body[locale]}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{t('confirmationTitle', locale)}</CardTitle>
          <ConfirmationBadge status={link.confirmationStatus} locale={locale} />
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('confirmationHint', locale)}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="sm:w-auto"
              disabled={confirming || link.confirmationStatus === 'confirmed'}
              onClick={() => void handleConfirmation('confirmed')}
            >
              <CheckCircle2 className="h-4 w-4" />
              {t('confirmPresence', locale)}
            </Button>
            <Button
              variant="outline"
              className="sm:w-auto"
              disabled={confirming || link.confirmationStatus === 'declined'}
              onClick={() => void handleConfirmation('declined')}
            >
              <XCircle className="h-4 w-4" />
              {t('declinePresence', locale)}
            </Button>
          </div>
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
          <CardTitle>
            {link.visitorId ? t('confirmYourData', locale) : t('yourData', locale)}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('yourDataHint', locale)}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
            <p className="text-sm font-medium">{t('lookupTitle', locale)}</p>
            <p className="text-xs text-muted-foreground">{t('lookupHint', locale)}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={lookupName}
                onChange={(e) => {
                  setLookupName(e.target.value)
                  patchDraft(0, { name: e.target.value })
                }}
                placeholder={t('fullName', locale)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={lookingUp}
                onClick={() => void handleLookup(0)}
              >
                {lookingUp && lookupIndex === 0
                  ? t('lookupSearching', locale)
                  : t('lookupButton', locale)}
              </Button>
            </div>
          </div>

          {drafts.map((draft, index) => (
            <div key={index} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {t('visitorN', locale)} {index + 1}
                </p>
                {isIntake && drafts.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDrafts((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    {t('removeVisitor', locale)}
                  </Button>
                ) : null}
              </div>
              {index > 0 ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={lookingUp}
                    onClick={() => void handleLookup(index)}
                  >
                    {lookingUp && lookupIndex === index
                      ? t('lookupSearching', locale)
                      : t('lookupButton', locale)}
                  </Button>
                </div>
              ) : null}
              <VisitorProfileFields
                values={draft}
                onChange={(patch) => patchDraft(index, patch)}
                variant={formVariant}
                locale={locale}
                showLgpd
                showCountry={false}
              />
            </div>
          ))}

          {isIntake ? (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <p className="text-sm">{t('addAnother', locale)}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setDrafts((prev) => [...prev, { ...EMPTY_VISITOR_PROFILE }])
                }
              >
                {t('addVisitor', locale)}
              </Button>
            </div>
          ) : null}

          <Button disabled={savingDraft} onClick={() => void handleSaveDraft()}>
            {savingDraft ? t('sending', locale) : t('sendData', locale)}
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
        Link válido até {formatDate(link.expiresAt.slice(0, 10))}
        {link.orgName ? ` · ${link.orgName}` : ' · Promover Experience'}
      </p>
    </PortalShell>
  )
}

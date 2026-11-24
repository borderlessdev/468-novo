import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useVisitDialog } from '@/contexts/VisitDialogContext'
import { BRAZILIAN_STATES, DEFAULT_CHECKLIST } from '@/lib/constants'
import { VALE_VPS } from '@/lib/valeVp'
import { usesValeDashboard } from '@/lib/orgDashboard'
import {
  quickVisitorSchema,
  visitSchema,
  type QuickVisitorInput,
  type VisitInput,
} from '@/lib/validations'
import {
  createVisit,
  getSuggestedPvNumber,
  getVisit,
  listOrgPvNumbers,
  listVisitTemplates,
  releasePvReservation,
  reserveNewPvNumber,
} from '@/services/visits'
import { createVisitFromTemplate } from '@/services/visitClone'
import { applyPlaybookToVisit } from '@/services/playbookApply'
import { listPlaybooks } from '@/services/playbooks'
import { createVisitor, listVisitors } from '@/services/visitors'
import { linkVisitorToVisit } from '@/services/visitVisitors'
import { createTasksBatch } from '@/services/tasks'
import { notifyVisitStakeholders } from '@/services/notifications'
import type { Playbook, Visit, Visitor } from '@/types'
import { Search, UserPlus, X } from 'lucide-react'
import { VisitEventFields } from '@/features/visits/VisitEventFields'
import {
  PvDuplicateSubmitDialog,
  PvNumberField,
} from '@/features/visits/PvNumberField'
import { kindsForExperienceTab } from '@/lib/visitEvent'
import { datesBetween, pruneCommunityDailyCapacity } from '@/lib/date'
import { normalizePvNumber, pvNumberExists } from '@/lib/pvNumber'

const COMMUNITY_KINDS = new Set(['visita_comunidade', 'comunidade_prioritaria'])

interface NewVisitDialogProps {
  onCreated?: () => void
}

export function NewVisitDialog({ onCreated }: NewVisitDialogProps) {
  const { open, setOpen, defaultEventKind } = useVisitDialog()
  const { user, isAdmin, profile } = useAuth()
  const { activeOrgId, activeOrg } = useOrg()
  const isValeOrg = usesValeDashboard(activeOrg)
  const [saving, setSaving] = useState(false)
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [selectedVisitors, setSelectedVisitors] = useState<Visitor[]>([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Visitor[]>([])
  const [templates, setTemplates] = useState<Visit[]>([])
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [existingPvNumbers, setExistingPvNumbers] = useState<string[]>([])
  const [suggestedPvNumber, setSuggestedPvNumber] = useState('1')
  const [allowDuplicatePv, setAllowDuplicatePv] = useState(false)
  const [pendingDuplicatePv, setPendingDuplicatePv] = useState<string | null>(null)

  const form = useForm<VisitInput>({
    resolver: zodResolver(visitSchema),
    defaultValues: {
      title: '',
      company: '',
      state: '',
      city: '',
      vp: '',
      vipAudience: '',
      visitorCountry: '',
      hasPlanting: false,
      planterName: '',
      postVisitInfo: '',
      requesterContact: '',
      approverName: '',
      startDate: '',
      endDate: '',
      status: 'planejamento',
      eventKind: undefined,
      vipSubtype: undefined,
      eventScope: undefined,
      objective: '',
      language: '',
      pvNumber: '',
      templateId: '',
      playbookId: '',
      startWithChecklist: true,
      hasTicketSales: false,
      communityDailyCapacity: {},
    },
  })

  const quickForm = useForm<QuickVisitorInput>({
    resolver: zodResolver(quickVisitorSchema),
    defaultValues: { name: '', document: '', company: '' },
  })

  useEffect(() => {
    if (!open || !user || !activeOrgId) return
    void listVisitors(activeOrgId).then(setVisitors)
    void listVisitTemplates(activeOrgId, user.uid, isAdmin).then(setTemplates)
    void listPlaybooks(activeOrgId).then(setPlaybooks)
    void (async () => {
      // Enumeração de PV (sugestão, lista e reserva) é exclusiva da Vale.
      const [existing, suggested] = isValeOrg
        ? await Promise.all([listOrgPvNumbers(activeOrgId), getSuggestedPvNumber(activeOrgId)])
        : [[] as string[], '']
      setExistingPvNumbers(existing)
      setSuggestedPvNumber(suggested)
      setAllowDuplicatePv(false)
      setPendingDuplicatePv(null)
      form.reset({
        title: '',
        company: '',
        state: '',
        city: '',
        vp: '',
        vipAudience: '',
        visitorCountry: '',
        hasPlanting: false,
        planterName: '',
        postVisitInfo: '',
        requesterContact: '',
        approverName: '',
        startDate: '',
        endDate: '',
        status: 'planejamento',
        eventKind: defaultEventKind,
        vipSubtype: undefined,
        eventScope: undefined,
        objective: '',
        language: '',
        pvNumber: suggested,
        templateId: '',
        playbookId: '',
        startWithChecklist: true,
        hasTicketSales: false,
        communityDailyCapacity: {},
      })
    })()
    // form.reset is stable from RHF; avoid listing `form` (new ref each render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user, activeOrgId, isAdmin, defaultEventKind, isValeOrg])

  const handleSearch = () => {
    const term = search.trim().toLowerCase()
    if (!term) {
      setSearchResults([])
      return
    }
    setSearchResults(
      visitors.filter(
        (v) =>
          v.name.toLowerCase().includes(term) ||
          v.document.toLowerCase().includes(term),
      ),
    )
  }

  useEffect(() => {
    handleSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search as user types
  }, [search, visitors])

  const addVisitor = (visitor: Visitor) => {
    if (selectedVisitors.some((v) => v.id === visitor.id)) return
    setSelectedVisitors((prev) => [...prev, visitor])
  }

  const removeVisitor = (id: string) => {
    setSelectedVisitors((prev) => prev.filter((v) => v.id !== id))
  }

  const onQuickCreate = quickForm.handleSubmit(async (values) => {
    if (!user || !activeOrgId) return
    try {
      const id = await createVisitor(user.uid, activeOrgId, {
        name: values.name,
        document: values.document,
        company: values.company,
      })
      const created: Visitor = {
        id,
        name: values.name,
        document: values.document,
        company: values.company,
        ownerId: user.uid,
        orgId: activeOrgId,
      }
      setVisitors((prev) => [...prev, created])
      addVisitor(created)
      quickForm.reset()
      toast.success('Visitante criado e adicionado')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível criar o visitante')
    }
  })

  /**
   * `reservePv`: true quando o número é novo (reserva atômica, evita colisão entre usuários);
   * false quando o usuário confirmou duplicar uma PV existente.
   */
  const createVisitWithValues = async (values: VisitInput, reservePv: boolean) => {
    if (!user || !activeOrgId) return
    setSaving(true)
    let reservedPv: string | null = null
    let created = false
    try {
      let pvNumber = normalizePvNumber(values.pvNumber)
      if (reservePv) {
        const reserved = await reserveNewPvNumber(activeOrgId, user.uid, pvNumber)
        reservedPv = reserved
        if (reserved !== pvNumber) {
          toast.info(
            `A PV ${pvNumber} acabou de ser usada por outro usuário. Esta visita foi criada com a PV ${reserved}.`,
          )
          pvNumber = reserved
        } else {
          pvNumber = reserved
        }
      }
      const communityDailyCapacity = COMMUNITY_KINDS.has(values.eventKind ?? '')
        ? pruneCommunityDailyCapacity(
            values.communityDailyCapacity,
            values.startDate,
            values.endDate,
          )
        : undefined
      let visitId: string
      if (values.templateId) {
        visitId = await createVisitFromTemplate(values.templateId, user.uid, {
          title: values.title,
          company: values.company,
          state: values.state,
          city: values.city,
          vp: values.vp,
          vipAudience: values.vipAudience,
          visitorCountry: values.visitorCountry,
          hasPlanting: values.hasPlanting === true,
          planterName: values.planterName,
          postVisitInfo: values.postVisitInfo,
          requesterContact: values.requesterContact,
          approverName: values.approverName,
          startDate: values.startDate,
          endDate: values.endDate,
          status: values.status,
          objective: values.objective,
          language: values.language,
          pvNumber,
          eventKind: values.eventKind,
          vipSubtype: values.vipSubtype,
          eventScope: values.eventScope,
          hasTicketSales: values.hasTicketSales === true,
          communityDailyCapacity,
        })
      } else {
        visitId = await createVisit(user.uid, activeOrgId, {
          title: values.title,
          company: values.company,
          state: values.state,
          city: values.city,
          vp: values.vp,
          vipAudience: values.eventKind === 'visita_vip' ? values.vipAudience : undefined,
          visitorCountry: values.visitorCountry,
          hasPlanting: values.hasPlanting === true,
          planterName: values.hasPlanting ? values.planterName : undefined,
          postVisitInfo: values.postVisitInfo,
          requesterContact: values.requesterContact,
          approverName: values.approverName,
          startDate: values.startDate,
          endDate: values.endDate,
          status: values.status,
          eventKind: values.eventKind,
          vipSubtype: values.vipSubtype,
          eventScope: values.eventScope,
          objective: values.objective,
          language: values.language,
          pvNumber,
          hasTicketSales: values.hasTicketSales === true,
          communityDailyCapacity,
          progress: 0,
          teamMemberIds: [],
        })
        if (values.startWithChecklist && !values.playbookId) {
          await createTasksBatch(user.uid, visitId, DEFAULT_CHECKLIST)
        }
      }
      created = true

      if (values.playbookId) {
        await applyPlaybookToVisit({
          playbookId: values.playbookId,
          visitId,
          ownerId: user.uid,
          startDate: values.startDate,
          isAdmin,
          actorId: user.uid,
          actorName: profile?.name,
        })
      }

      await Promise.all(
        selectedVisitors.map((visitor) =>
          linkVisitorToVisit(user.uid, visitId, visitor.id),
        ),
      )

      const createdVisit = await getVisit(visitId)
      if (createdVisit) {
        try {
          await notifyVisitStakeholders(createdVisit, {
            type: 'visit_created',
            title: 'Nova visita criada',
            body: `"${values.title}" foi adicionada ao sistema`,
            visitId,
            href: `/visitas/${visitId}`,
            actorId: user.uid,
            actorName: profile?.name,
          })
        } catch (error) {
          console.warn('Failed to send visit_created notification', error)
        }
      }

      toast.success('Visita criada com sucesso')
      form.reset()
      setSelectedVisitors([])
      setSearch('')
      setSearchResults([])
      setAllowDuplicatePv(false)
      setPendingDuplicatePv(null)
      setOpen(false)
      onCreated?.()
    } catch (error) {
      console.error(error)
      if (!created && reservedPv && activeOrgId) {
        await releasePvReservation(activeOrgId, reservedPv)
      }
      const code = (error as { code?: string }).code
      toast.error(
        code === 'permission-denied'
          ? 'Sem permissão no Firestore. Confirme se as regras foram publicadas.'
          : 'Não foi possível criar a visita',
      )
    } finally {
      setSaving(false)
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!activeOrgId) return
    const pvNumber = normalizePvNumber(values.pvNumber)
    if (!isValeOrg) {
      // Demais organizações: campo livre, sem enumeração nem reserva.
      await createVisitWithValues({ ...values, pvNumber }, false)
      return
    }
    // Lista atualizada no submit: o modal pode estar aberto há tempo e outro usuário ter criado PVs.
    const fresh = await listOrgPvNumbers(activeOrgId)
    setExistingPvNumbers(fresh)
    const alreadyExists = pvNumberExists(pvNumber, fresh)
    if (alreadyExists && !allowDuplicatePv) {
      setPendingDuplicatePv(pvNumber)
      return
    }
    await createVisitWithValues({ ...values, pvNumber }, !alreadyExists)
  })

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {defaultEventKind === 'evento' ? 'Nova experiência de evento' : 'Nova experiência'}
          </DialogTitle>
          <DialogDescription>
            Preencha os dados da experiência e associe visitantes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {templates.length > 0 ? (
              <div className="space-y-2">
                <Label>Template de visita (cópia estrutural)</Label>
                <Select
                  value={form.watch('templateId') || '_none'}
                  onValueChange={(value) => {
                    const next = value === '_none' ? '' : value
                    form.setValue('templateId', next)
                    if (next) form.setValue('playbookId', '')
                  }}
                  disabled={Boolean(form.watch('playbookId'))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sem template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sem template</SelectItem>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Copia visita modelo (isTemplate). Não use junto com playbook.
                </p>
              </div>
            ) : null}
            {playbooks.length > 0 ? (
              <div className="space-y-2">
                <Label>Modelo operacional (playbook)</Label>
                <Select
                  value={form.watch('playbookId') || '_none'}
                  onValueChange={(value) => {
                    const next = value === '_none' ? '' : value
                    form.setValue('playbookId', next)
                    if (next) {
                      form.setValue('templateId', '')
                      form.setValue('startWithChecklist', false)
                    }
                  }}
                  disabled={Boolean(form.watch('templateId'))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sem playbook" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sem playbook</SelectItem>
                    {playbooks.map((playbook) => (
                      <SelectItem key={playbook.id} value={playbook.id}>
                        {playbook.name}
                        {playbook.visitType ? ` · ${playbook.visitType}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Forma principal de checklist: gera tarefas, atividades e documentos com prazos relativos.
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input id="title" {...form.register('title')} />
              {form.formState.errors.title ? (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              ) : null}
            </div>
            <VisitEventFields
              eventKind={form.watch('eventKind')}
              vipSubtype={form.watch('vipSubtype')}
              eventScope={form.watch('eventScope')}
              allowedKinds={kindsForExperienceTab(
                defaultEventKind === 'evento' ? 'eventos' : 'visitas',
              )}
              onEventKindChange={(value) =>
                form.setValue('eventKind', value, { shouldValidate: true })
              }
              onVipSubtypeChange={(value) =>
                form.setValue('vipSubtype', value, { shouldValidate: true })
              }
              onEventScopeChange={(value) =>
                form.setValue('eventScope', value, { shouldValidate: true })
              }
              errors={form.formState.errors}
            />
            {isValeOrg && form.watch('eventKind') === 'visita_vip' ? (
              <div className="space-y-2 border-l-2 border-primary/30 pl-3">
                <Label htmlFor="vipAudience">Público</Label>
                <Input
                  id="vipAudience"
                  placeholder="Público a ser preenchido"
                  {...form.register('vipAudience')}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="company">Empresa</Label>
              <Input id="company" {...form.register('company')} />
            </div>
            {isValeOrg ? (
              <PvNumberField
                value={form.watch('pvNumber') ?? ''}
                suggestedNext={suggestedPvNumber}
                existingNumbers={existingPvNumbers}
                error={form.formState.errors.pvNumber?.message}
                onChange={(next) => {
                  form.setValue('pvNumber', next, { shouldValidate: true })
                  setAllowDuplicatePv(false)
                }}
                onDuplicateConfirmed={() => setAllowDuplicatePv(true)}
              />
            ) : (
              <div className="space-y-2">
                <Label htmlFor="pvNumber">Número da PV *</Label>
                <Input
                  id="pvNumber"
                  placeholder="Informe o número da PV"
                  {...form.register('pvNumber')}
                />
                {form.formState.errors.pvNumber ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.pvNumber.message}
                  </p>
                ) : null}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={form.watch('state') || '_unset'}
                  onValueChange={(value) =>
                    form.setValue('state', value === '_unset' ? '' : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_unset">UF</SelectItem>
                    {BRAZILIAN_STATES.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Local / Cidade</Label>
                <Input id="city" {...form.register('city')} />
              </div>
            </div>
            {isValeOrg ? (
              <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="space-y-2">
                  <Label htmlFor="visitorCountry">País do visitante</Label>
                  <Input
                    id="visitorCountry"
                    placeholder="Ex.: Brasil, Chile, China..."
                    {...form.register('visitorCountry')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>VP solicitante da visita</Label>
                  <Select
                    value={form.watch('vp') || '_unset'}
                    onValueChange={(value) =>
                      form.setValue('vp', value === '_unset' ? '' : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a VP / área" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_unset">Sem VP</SelectItem>
                      {VALE_VPS.map((vp) => (
                        <SelectItem key={vp} value={vp}>
                          {vp}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="requesterContact">Ponto focal solicitante</Label>
                    <Input
                      id="requesterContact"
                      placeholder="Nome do ponto focal"
                      {...form.register('requesterContact')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="approverName">Responsável pela aprovação</Label>
                    <Input
                      id="approverName"
                      placeholder="Nome do aprovador"
                      {...form.register('approverName')}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor="hasPlanting">Vai ter plantio?</Label>
                    <p className="text-xs text-muted-foreground">Sim ou não</p>
                  </div>
                  <Switch
                    id="hasPlanting"
                    checked={form.watch('hasPlanting') === true}
                    onCheckedChange={(checked) => {
                      form.setValue('hasPlanting', checked)
                      if (!checked) form.setValue('planterName', '')
                    }}
                  />
                </div>
                {form.watch('hasPlanting') ? (
                  <div className="space-y-2">
                    <Label htmlFor="planterName">Quem vai plantar?</Label>
                    <Input
                      id="planterName"
                      placeholder="Nome de quem vai plantar"
                      {...form.register('planterName')}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="postVisitInfo">Informações essenciais pós visita</Label>
                  <Textarea
                    id="postVisitInfo"
                    rows={3}
                    placeholder="Anotações essenciais após a visita"
                    {...form.register('postVisitInfo')}
                  />
                </div>
              </div>
            ) : null}
            {COMMUNITY_KINDS.has(form.watch('eventKind') ?? '') ? (
              <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
                <Label>Vagas por dia *</Label>
                {datesBetween(form.watch('startDate'), form.watch('endDate')).length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {datesBetween(form.watch('startDate'), form.watch('endDate')).map((date) => (
                      <label key={date} className="flex items-center justify-between gap-2 text-sm">
                        <span>{date.split('-').reverse().join('/')}</span>
                        <Input
                          type="number"
                          min="1"
                          className="h-9 w-24"
                          value={form.watch(`communityDailyCapacity.${date}`) ?? ''}
                          onChange={(event) =>
                            form.setValue(`communityDailyCapacity.${date}`, Number(event.target.value), {
                              shouldValidate: true,
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Informe o período para definir as vagas.</p>
                )}
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">Data início *</Label>
                <Input id="startDate" type="date" {...form.register('startDate')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">Data fim *</Label>
                <Input id="endDate" type="date" {...form.register('endDate')} />
                {form.formState.errors.endDate ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.endDate.message}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(value) =>
                  form.setValue('status', value as VisitInput['status'])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planejamento">PLANEJAMENTO</SelectItem>
                  <SelectItem value="em_andamento">EM ANDAMENTO</SelectItem>
                  <SelectItem value="concluida">CONCLUÍDA</SelectItem>
                  <SelectItem value="cancelada">CANCELADA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="objective">Objetivo</Label>
              <Input id="objective" {...form.register('objective')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Idioma</Label>
              <Input id="language" placeholder="Português, Inglês..." {...form.register('language')} />
            </div>
            {!form.watch('templateId') && !form.watch('playbookId') ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.watch('startWithChecklist')}
                  onCheckedChange={(checked) =>
                    form.setValue('startWithChecklist', checked === true)
                  }
                />
                Iniciar com check-list básico
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.watch('hasTicketSales') === true}
                onCheckedChange={(checked) =>
                  form.setValue('hasTicketSales', checked === true)
                }
              />
              Tem venda de ingressos (Gestão de Receitas)
            </label>
          </div>

          <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
            <div>
              <h3 className="font-semibold">
                {defaultEventKind === 'evento'
                  ? 'Convidados deste evento'
                  : 'Visitantes'}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {defaultEventKind === 'evento'
                  ? 'Busque convidados existentes ou cadastre um novo rapidamente.'
                  : 'Busque visitantes existentes ou cadastre um novo rapidamente.'}
              </p>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Buscar por nome ou documento"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={handleSearch}>
                <Search className="h-4 w-4" />
                Buscar
              </Button>
            </div>

            {searchResults.length > 0 ? (
              <div className="space-y-2">
                {searchResults.map((visitor) => (
                  <button
                    key={visitor.id}
                    type="button"
                    onClick={() => addVisitor(visitor)}
                    className="flex w-full items-center justify-between rounded-lg border bg-card px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>
                      {visitor.name}
                      <span className="ml-2 text-muted-foreground">{visitor.document}</span>
                    </span>
                    <UserPlus className="h-4 w-4" />
                  </button>
                ))}
              </div>
            ) : null}

            {selectedVisitors.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedVisitors.map((visitor) => (
                  <span
                    key={visitor.id}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
                  >
                    {visitor.name}
                    <button type="button" onClick={() => removeVisitor(visitor.id)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="space-y-3 border-t border-border pt-4">
              <h4 className="text-sm font-medium">Cadastrar novo visitante rápido</h4>
              <div className="space-y-2">
                <Label>Nome do visitante *</Label>
                <Input {...quickForm.register('name')} />
              </div>
              <div className="space-y-2">
                <Label>Documento (CPF/passaporte) *</Label>
                <Input {...quickForm.register('document')} />
              </div>
              <div className="space-y-2">
                <Label>Empresa (opcional)</Label>
                <Input {...quickForm.register('company')} />
              </div>
              <Button type="button" variant="secondary" onClick={onQuickCreate}>
                Criar e adicionar à visita
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 lg:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar visita'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <PvDuplicateSubmitDialog
      open={pendingDuplicatePv != null}
      existingPv={pendingDuplicatePv ?? ''}
      suggestedNext={suggestedPvNumber}
      onOpenChange={(next) => {
        if (!next) setPendingDuplicatePv(null)
      }}
      onUseNew={() => {
        form.setValue('pvNumber', suggestedPvNumber, { shouldValidate: true })
        setAllowDuplicatePv(false)
        setPendingDuplicatePv(null)
      }}
      onDuplicate={() => {
        if (!pendingDuplicatePv) return
        const pv = pendingDuplicatePv
        form.setValue('pvNumber', pv, { shouldValidate: true })
        setAllowDuplicatePv(true)
        setPendingDuplicatePv(null)
        void createVisitWithValues(
          {
            ...form.getValues(),
            pvNumber: pv,
          },
          false,
        )
      }}
    />
    </>
  )
}

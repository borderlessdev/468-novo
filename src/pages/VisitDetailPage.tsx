import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { toastMovedToTrash } from '@/lib/toast'
import {
  ArrowLeft,
  Calendar,
  ClipboardList,
  Copy,
  DollarSign,
  FileStack,
  FileText,
  Mail,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/shared/ConfirmDeleteDialog'
import { VisitStatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { canDeleteVisit, canManageVisitAccess, isNavAllowed } from '@/lib/access'
import { BRAZILIAN_STATES } from '@/lib/constants'
import { visitEditSchema, type VisitEditInput } from '@/lib/validations'
import {
  calculateVisitProgress,
  formatCurrency,
  formatDate,
} from '@/lib/utils'
import { listFinanceItems } from '@/services/finance'
import { listTasks } from '@/services/tasks'
import {
  deleteDocument,
  getDocumentDownloadUrl,
  listDocuments,
  uploadDocument,
} from '@/services/documents'
import { listVisitors, getVisitorsByIds } from '@/services/visitors'
import {
  linkVisitorToVisit,
  listVisitVisitors,
  unlinkVisitVisitor,
} from '@/services/visitVisitors'
import { deleteVisit, getVisit, syncVisitProgress, updateVisit } from '@/services/visits'
import { writeActivityLog, listActivityLogsForVisit } from '@/services/activityLogs'
import { duplicateVisit, saveVisitAsTemplate } from '@/services/visitClone'
import { isFirestoreEmailEnabled, sendVisitSummaryEmail } from '@/services/email'
import type { ActivityLog, DocumentCategory, Visitor, Visit, VisitDocument } from '@/types'

const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'contrato', label: 'Contrato' },
  { value: 'boarding', label: 'Boarding pass' },
  { value: 'briefing', label: 'Briefing' },
  { value: 'comprovante', label: 'Comprovante' },
  { value: 'outro', label: 'Outro' },
]

export function VisitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isAdmin, role, canWrite, profile } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [visit, setVisit] = useState<Visit | null>(null)
  const [linkedVisitors, setLinkedVisitors] = useState<Visitor[]>([])
  const [allVisitors, setAllVisitors] = useState<Visitor[]>([])
  const [documents, setDocuments] = useState<VisitDocument[]>([])
  const [pendingTasks, setPendingTasks] = useState(0)
  const [financeTotal, setFinanceTotal] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [docCategory, setDocCategory] = useState<DocumentCategory>('outro')
  const [visitorSearch, setVisitorSearch] = useState('')
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [teamIdsInput, setTeamIdsInput] = useState('')
  const [clientIdsInput, setClientIdsInput] = useState('')
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [cloning, setCloning] = useState(false)
  const deleteVisitDialog = useConfirmDelete<{ id: string; name: string }>()
  const deleteDocDialog = useConfirmDelete<VisitDocument>()

  const form = useForm<VisitEditInput>({
    resolver: zodResolver(visitEditSchema),
  })
  const { reset } = form

  const load = useCallback(async () => {
    if (!id || !user) return
    setLoading(true)
    try {
      const visitData = await getVisit(id)
      if (!visitData) {
        toast.error('Visita não encontrada')
        navigate('/visitas')
        return
      }
      setVisit(visitData)
      setTeamIdsInput(visitData.teamMemberIds.join(', '))
      setClientIdsInput(visitData.clientUserIds.join(', '))
      reset({
        title: visitData.title,
        company: visitData.company ?? '',
        state: visitData.state ?? '',
        city: visitData.city ?? '',
        startDate: visitData.startDate,
        endDate: visitData.endDate,
        status: visitData.status,
        objective: visitData.objective ?? '',
        language: visitData.language ?? '',
      })

      const ownerIdForQuery = visitData.ownerId

      const results = await Promise.allSettled([
        listVisitVisitors(id, ownerIdForQuery, isAdmin),
        canWrite
          ? listVisitors(user.uid, isAdmin)
          : Promise.resolve([] as Visitor[]),
        listTasks(id, ownerIdForQuery, isAdmin),
        listFinanceItems(id, ownerIdForQuery, isAdmin),
        listDocuments(id, ownerIdForQuery, isAdmin),
      ])

      const failed = results.filter((result) => result.status === 'rejected')
      if (failed.length > 0) {
        failed.forEach((result) => {
          if (result.status === 'rejected') console.error(result.reason)
        })
        toast.error('Alguns dados da visita não puderam ser carregados')
      }

      const links = results[0].status === 'fulfilled' ? results[0].value : []
      const visitors = results[1].status === 'fulfilled' ? results[1].value : []
      const tasks = results[2].status === 'fulfilled' ? results[2].value : []
      const finance = results[3].status === 'fulfilled' ? results[3].value : []
      const docs = results[4].status === 'fulfilled' ? results[4].value : []

      let linked: Visitor[]
      try {
        linked = await getVisitorsByIds(links.map((l) => l.visitorId))
      } catch (error) {
        console.error(error)
        linked = []
        toast.error('Não foi possível carregar visitantes vinculados')
      }

      setLinkedVisitors(linked)
      setAllVisitors(visitors)
      setDocuments(docs)
      setPendingTasks(tasks.filter((t) => t.status !== 'completed').length)
      setFinanceTotal(
        finance.reduce((sum, item) => sum + (item.serviceValue ?? 0), 0),
      )

      try {
        setActivityLogs(await listActivityLogsForVisit(id))
      } catch (error) {
        console.error(error)
        setActivityLogs([])
      }

      const progress = calculateVisitProgress(tasks)
      if (progress !== visitData.progress) {
        try {
          await syncVisitProgress(id, progress)
          setVisit((prev) => (prev ? { ...prev, progress } : prev))
        } catch (error) {
          console.error(error)
        }
      }
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar visita')
    } finally {
      setLoading(false)
    }
  }, [id, user, isAdmin, canWrite, navigate, reset])

  useEffect(() => {
    void load()
  }, [load])

  const visitorResults = useMemo(() => {
    const term = visitorSearch.trim().toLowerCase()
    if (!term) return []
    const linkedIds = new Set(linkedVisitors.map((v) => v.id))
    return allVisitors
      .filter(
        (v) =>
          !linkedIds.has(v.id) &&
          (v.name.toLowerCase().includes(term) ||
            v.document.toLowerCase().includes(term)),
      )
      .slice(0, 5)
  }, [visitorSearch, allVisitors, linkedVisitors])

  const parseUidList = (value: string) =>
    value
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)

  const onSave = form.handleSubmit(async (values) => {
    if (!id || !visit) return
    setSaving(true)
    try {
      const payload: Parameters<typeof updateVisit>[1] = {
        title: values.title,
        company: values.company || undefined,
        state: values.state || undefined,
        city: values.city || undefined,
        startDate: values.startDate,
        endDate: values.endDate,
        status: values.status,
        objective: values.objective || undefined,
        language: values.language || undefined,
      }
      if (canManageVisitAccess(role, isAdmin, visit, user!.uid)) {
        payload.teamMemberIds = parseUidList(teamIdsInput)
        payload.clientUserIds = parseUidList(clientIdsInput)
      }
      await updateVisit(id, payload)
      try {
        await writeActivityLog({
          entityType: 'visit',
          entityId: id,
          visitId: id,
          action: 'updated',
          summary: `Visita "${values.title}" atualizada`,
          actorId: user!.uid,
          actorName: undefined,
        })
      } catch (error) {
        console.warn(error)
      }
      toast.success('Visita atualizada')
      await load()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar')
    } finally {
      setSaving(false)
    }
  })

  const handleDeleteVisit = () => {
    if (!id || !visit || !user) return
    deleteVisitDialog.requestDelete({ id, name: visit.title })
  }

  const handleDeleteVisitConfirm = () => {
    void deleteVisitDialog.confirm(async (item) => {
      if (!user) return
      await deleteVisit(item.id, user.uid)
      toastMovedToTrash('Visita movida para a lixeira')
      navigate('/visitas')
    })
  }

  const handleDeleteDocRequest = (doc: VisitDocument) => {
    deleteDocDialog.requestDelete(doc)
  }

  const handleDeleteDocConfirm = () => {
    void deleteDocDialog.confirm(async (doc) => {
      if (!user) return
      await deleteDocument(doc, user.uid)
      toastMovedToTrash('Documento movido para a lixeira')
      await load()
    })
  }

  const handleLinkVisitor = async (visitor: Visitor) => {
    if (!user || !id) return
    try {
      await linkVisitorToVisit(user.uid, id, visitor.id)
      setVisitorSearch('')
      toast.success('Visitante vinculado')
      await load()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível vincular')
    }
  }

  const handleUnlinkVisitor = async (visitorId: string) => {
    if (!user || !id) return
    try {
      const links = await listVisitVisitors(id, user.uid, isAdmin)
      const link = links.find((l) => l.visitorId === visitorId)
      if (link) {
        await unlinkVisitVisitor(link.id)
        toast.success('Visitante desvinculado')
        await load()
      }
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível desvincular')
    }
  }

  const handleUpload = async (file: File) => {
    if (!user || !id) return
    setUploading(true)
    try {
      await uploadDocument(user.uid, id, file, docCategory)
      toast.success('Documento enviado')
      await load()
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Falha no upload')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDownloadDoc = async (doc: VisitDocument) => {
    try {
      const url = await getDocumentDownloadUrl(doc.storagePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível abrir o arquivo')
    }
  }

  const handleDeleteDoc = (doc: VisitDocument) => {
    handleDeleteDocRequest(doc)
  }

  const emailSummary = visit
    ? [
        `Visita: ${visit.title}`,
        visit.company ? `Empresa: ${visit.company}` : '',
        `Período: ${formatDate(visit.startDate)} — ${formatDate(visit.endDate)}`,
        `Status: ${visit.status}`,
        visit.objective ? `Objetivo: ${visit.objective}` : '',
        `Visitantes: ${linkedVisitors.length}`,
        `Tarefas pendentes: ${pendingTasks}`,
        `Total financeiro: ${formatCurrency(financeTotal)}`,
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  const handleSendEmail = async () => {
    if (!visit || !user) return
    setSendingEmail(true)
    try {
      const mode = await sendVisitSummaryEmail({
        to: emailTo,
        subject: `Resumo da visita: ${visit.title}`,
        body: emailSummary,
        visitId: visit.id,
        createdBy: user.uid,
      })
      if (mode === 'firestore') {
        toast.success('Resumo enfileirado para envio por e-mail')
      } else {
        toast.success('Cliente de e-mail aberto com o resumo')
      }
      setEmailOpen(false)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o resumo')
    } finally {
      setSendingEmail(false)
    }
  }

  const showDelete = visit && user && canDeleteVisit(role, isAdmin, visit, user.uid)
  const showAccessFields = visit && user && canManageVisitAccess(role, isAdmin, visit, user.uid)

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!visit) return null

  return (
    <div>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/visitas">
            <ArrowLeft className="h-4 w-4" />
            Voltar às visitas
          </Link>
        </Button>
      </div>

      <PageHeader
        title={visit.title}
        description={visit.company || visit.pvNumber || 'Detalhes da visita'}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setEmailOpen(true)}>
              <Mail className="h-4 w-4" />
              Enviar resumo
            </Button>
            {canWrite ? (
              <>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={cloning || !user}
                  onClick={() => {
                    if (!user || !id) return
                    setCloning(true)
                    void duplicateVisit(id, user.uid)
                      .then((newId) => {
                        toast.success('Visita duplicada')
                        navigate(`/visitas/${newId}`)
                      })
                      .catch((error) => {
                        console.error(error)
                        toast.error('Não foi possível duplicar')
                      })
                      .finally(() => setCloning(false))
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Duplicar
                </Button>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={cloning || !user}
                  onClick={() => {
                    if (!user || !id) return
                    setCloning(true)
                    void saveVisitAsTemplate(id, user.uid)
                      .then(() => toast.success('Modelo salvo'))
                      .catch((error) => {
                        console.error(error)
                        toast.error('Não foi possível salvar modelo')
                      })
                      .finally(() => setCloning(false))
                  }}
                >
                  <FileStack className="h-4 w-4" />
                  Salvar como modelo
                </Button>
              </>
            ) : null}
            {showDelete ? (
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDeleteVisit}>
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <VisitStatusBadge status={visit.status} />
        <span className="text-sm text-muted-foreground">
          PV: {visit.pvNumber || '—'}
        </span>
        <div className="flex min-w-[160px] items-center gap-2">
          <Progress value={visit.progress} className="flex-1" />
          <span className="text-xs text-muted-foreground">{visit.progress}%</span>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Button variant="outline" className="justify-start" asChild>
          <Link to={`/agenda?visita=${visit.id}`}>
            <Calendar className="h-4 w-4" />
            Programação
          </Link>
        </Button>
        {isNavAllowed('/planejamento', role, isAdmin, profile?.modulePermissions) ? (
          <Button variant="outline" className="justify-start" asChild>
            <Link to={`/planejamento?visita=${visit.id}`}>
              <ClipboardList className="h-4 w-4" />
              Planejamento
            </Link>
          </Button>
        ) : null}
        {isNavAllowed('/financeiro', role, isAdmin, profile?.modulePermissions) ? (
          <Button variant="outline" className="justify-start" asChild>
            <Link to={`/financeiro?visita=${visit.id}`}>
              <DollarSign className="h-4 w-4" />
              Financeiro ({formatCurrency(financeTotal)})
            </Link>
          </Button>
        ) : null}
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4 shrink-0" />
          {linkedVisitors.length} visitante(s) · {pendingTasks} tarefa(s)
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações da visita</CardTitle>
          </CardHeader>
          <CardContent>
            {canWrite ? (
            <form onSubmit={onSave} className="space-y-3">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input {...form.register('title')} />
              </div>
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Input {...form.register('company')} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
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
                      <SelectItem value="_unset">—</SelectItem>
                      {BRAZILIAN_STATES.map((uf) => (
                        <SelectItem key={uf} value={uf}>
                          {uf}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input {...form.register('city')} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Data início</Label>
                  <Input type="date" {...form.register('startDate')} />
                </div>
                <div className="space-y-2">
                  <Label>Data fim</Label>
                  <Input type="date" {...form.register('endDate')} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.watch('status')}
                  onValueChange={(value) =>
                    form.setValue('status', value as VisitEditInput['status'])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planejamento">Planejamento</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Objetivo</Label>
                <Textarea {...form.register('objective')} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Idioma</Label>
                <Input {...form.register('language')} placeholder="Português, Inglês..." />
              </div>
              {showAccessFields ? (
                <>
                  <div className="space-y-2">
                    <Label>UIDs da equipe (vírgula)</Label>
                    <Input
                      value={teamIdsInput}
                      onChange={(e) => setTeamIdsInput(e.target.value)}
                      placeholder="uid1, uid2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>UIDs dos clientes (vírgula)</Label>
                    <Input
                      value={clientIdsInput}
                      onChange={(e) => setClientIdsInput(e.target.value)}
                      placeholder="uid-cliente"
                    />
                  </div>
                </>
              ) : null}
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </form>
            ) : (
              <dl className="space-y-2 text-sm">
                <div><dt className="text-muted-foreground">Empresa</dt><dd>{visit.company || '—'}</dd></div>
                <div><dt className="text-muted-foreground">Local</dt><dd>{visit.city || '—'}{visit.state ? `, ${visit.state}` : ''}</dd></div>
                <div><dt className="text-muted-foreground">Período</dt><dd>{formatDate(visit.startDate)} — {formatDate(visit.endDate)}</dd></div>
                <div><dt className="text-muted-foreground">Objetivo</dt><dd>{visit.objective || '—'}</dd></div>
                <div><dt className="text-muted-foreground">Idioma</dt><dd>{visit.language || '—'}</dd></div>
              </dl>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visitantes vinculados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canWrite ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="Buscar visitante para vincular"
                    value={visitorSearch}
                    onChange={(e) => setVisitorSearch(e.target.value)}
                  />
                </div>
              ) : null}
              {canWrite && visitorResults.length > 0 ? (
                <div className="space-y-1">
                  {visitorResults.map((visitor) => (
                    <button
                      key={visitor.id}
                      type="button"
                      onClick={() => void handleLinkVisitor(visitor)}
                      className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span>
                        {visitor.name}
                        <span className="ml-2 text-muted-foreground">
                          {visitor.document}
                        </span>
                      </span>
                      <UserPlus className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              ) : null}
              {linkedVisitors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum visitante vinculado.
                </p>
              ) : (
                <ul className="space-y-2">
                  {linkedVisitors.map((visitor) => (
                    <li
                      key={visitor.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{visitor.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {visitor.company || visitor.document}
                        </p>
                      </div>
                      {canWrite ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void handleUnlinkVisitor(visitor.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documentos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canWrite ? (
              <>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  value={docCategory}
                  onValueChange={(v) => setDocCategory(v as DocumentCategory)}
                >
                  <SelectTrigger className="sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleUpload(file)
                  }}
                />
                <Button
                  variant="outline"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? 'Enviando...' : 'Upload'}
                </Button>
              </div>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum documento. Requer Firebase Storage habilitado.
                </p>
              ) : (
                <ul className="space-y-2">
                  {documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">{doc.category}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleDownloadDoc(doc)}
                        >
                          Abrir
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteDoc(doc)}
                        >
                          Excluir
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              </>
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum documento.</p>
              ) : (
                <ul className="space-y-2">
                  {documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="truncate font-medium">{doc.name}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => void handleDownloadDoc(doc)}>
                        Abrir
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {activityLogs.map((log) => (
                <li key={log.id} className="rounded-lg border px-3 py-2">
                  <p className="font-medium">{log.summary || log.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.actorName || 'Usuário'}
                    {log.entityType ? ` · ${log.entityType}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar resumo por e-mail</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Destinatário</Label>
              <Input
                type="email"
                placeholder="email@empresa.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Pré-visualização</Label>
              <Textarea readOnly rows={8} value={emailSummary} className="font-mono text-xs" />
            </div>
            <p className="text-xs text-muted-foreground">
              {isFirestoreEmailEnabled()
                ? 'O resumo será enfileirado na coleção mail e enviado pela extensão Trigger Email (SMTP/SendGrid).'
                : 'Abre seu cliente de e-mail com o resumo preenchido. Para envio automático, defina VITE_EMAIL_MODE=firestore e instale a extensão Trigger Email.'}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setEmailOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void handleSendEmail()} disabled={sendingEmail}>
                {sendingEmail
                  ? 'Enviando…'
                  : isFirestoreEmailEnabled()
                    ? 'Enviar e-mail'
                    : 'Preparar envio'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteVisitDialog.open}
        onOpenChange={deleteVisitDialog.handleOpenChange}
        itemName={deleteVisitDialog.target?.name}
        loading={deleteVisitDialog.loading}
        onConfirm={handleDeleteVisitConfirm}
      />

      <ConfirmDeleteDialog
        open={deleteDocDialog.open}
        onOpenChange={deleteDocDialog.handleOpenChange}
        itemName={deleteDocDialog.target?.name}
        loading={deleteDocDialog.loading}
        onConfirm={handleDeleteDocConfirm}
      />
    </div>
  )
}

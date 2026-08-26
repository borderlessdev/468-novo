import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { toastMovedToTrash } from '@/lib/toast'
import {
  ArrowLeft,
  Ban,
  Calendar,
  ClipboardList,
  Copy,
  DollarSign,
  DownloadCloud,
  FileStack,
  FileText,
  Link2,
  Mail,
  RefreshCcw,
  Sparkles,
  Star,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/shared/ConfirmDeleteDialog'
import { VisitStatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { listTasks, updateTask } from '@/services/tasks'
import { listActivities } from '@/services/activities'
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
import { applyPlaybookToVisit, saveVisitAsPlaybook } from '@/services/playbookApply'
import { listPlaybooks } from '@/services/playbooks'
import { listDocumentPlaceholders } from '@/services/documentPlaceholders'
import { unmatchedPlaceholders } from '@/lib/operations'
import { isFirestoreEmailEnabled, sendVisitSummaryEmail } from '@/services/email'
import { draftCommunication } from '@/services/ai'
import {
  applyVisitorDraft,
  buildGuestAgenda,
  buildGuestPortalUrl,
  createGuestLink,
  getGuestLinkAvailability,
  hasPendingGuestDraft,
  listLinksForVisit,
  refreshGuestLinkSnapshot,
  revokeLink,
  type GuestLinkSnapshot,
} from '@/services/visitGuestLinks'
import { averageRating, listFeedbacksForVisit } from '@/services/visitFeedbacks'
import type {
  Activity,
  ActivityLog,
  DocumentCategory,
  DocumentPlaceholder,
  Playbook,
  PlaybookPhase,
  Task,
  Visit,
  VisitDocument,
  VisitFeedback,
  VisitGuestLink,
  Visitor,
} from '@/types'

const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'contrato', label: 'Contrato' },
  { value: 'boarding', label: 'Boarding pass' },
  { value: 'briefing', label: 'Briefing' },
  { value: 'comprovante', label: 'Comprovante' },
  { value: 'outro', label: 'Outro' },
]

function GuestStatusBadge({ link }: { link: VisitGuestLink }) {
  if (link.confirmationStatus === 'confirmed') {
    return <Badge variant="success">Confirmado</Badge>
  }
  if (link.confirmationStatus === 'declined') {
    return <Badge variant="warning">Recusado</Badge>
  }
  return <Badge variant="muted">Aguardando resposta</Badge>
}

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
  const [placeholders, setPlaceholders] = useState<DocumentPlaceholder[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [pendingTasks, setPendingTasks] = useState(0)
  const [taskCount, setTaskCount] = useState(0)
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null)
  const [financeTotal, setFinanceTotal] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [docCategory, setDocCategory] = useState<DocumentCategory>('outro')
  const [visitorSearch, setVisitorSearch] = useState('')
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [draftingEmail, setDraftingEmail] = useState(false)
  const [guestInviteOpen, setGuestInviteOpen] = useState(false)
  const [guestInviteBody, setGuestInviteBody] = useState('')
  const [guestInviteLabel, setGuestInviteLabel] = useState('')
  const [draftingGuestInvite, setDraftingGuestInvite] = useState(false)
  const [teamIdsInput, setTeamIdsInput] = useState('')
  const [clientIdsInput, setClientIdsInput] = useState('')
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [guestLinks, setGuestLinks] = useState<VisitGuestLink[]>([])
  const [feedbacks, setFeedbacks] = useState<VisitFeedback[]>([])
  const [portalBusyId, setPortalBusyId] = useState<string | null>(null)
  const [cloning, setCloning] = useState(false)
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [playbookOpen, setPlaybookOpen] = useState(false)
  const [selectedPlaybookId, setSelectedPlaybookId] = useState('')
  const [applyingPlaybook, setApplyingPlaybook] = useState(false)
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
        arrivalInstructions: visitData.arrivalInstructions ?? '',
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
        listDocumentPlaceholders(id, ownerIdForQuery, isAdmin),
        listActivities(id, ownerIdForQuery, isAdmin),
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
      const tasksData = results[2].status === 'fulfilled' ? results[2].value : []
      const finance = results[3].status === 'fulfilled' ? results[3].value : []
      const docs = results[4].status === 'fulfilled' ? results[4].value : []
      const pendingDocs = results[5].status === 'fulfilled' ? results[5].value : []
      const activitiesData = results[6].status === 'fulfilled' ? results[6].value : []

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
      setPlaceholders(pendingDocs)
      setTasks(tasksData)
      setActivities(activitiesData)
      setTaskCount(tasksData.length)
      setPendingTasks(tasksData.filter((t) => t.status !== 'completed').length)
      setFinanceTotal(
        finance.reduce((sum, item) => sum + (item.serviceValue ?? 0), 0),
      )

      try {
        setActivityLogs(await listActivityLogsForVisit(id))
      } catch (error) {
        console.error(error)
        setActivityLogs([])
      }

      const portalResults = await Promise.allSettled([
        listLinksForVisit(id),
        listFeedbacksForVisit(id, ownerIdForQuery, isAdmin),
      ])
      setGuestLinks(portalResults[0].status === 'fulfilled' ? portalResults[0].value : [])
      setFeedbacks(portalResults[1].status === 'fulfilled' ? portalResults[1].value : [])

      const progress = calculateVisitProgress(tasksData)
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
        arrivalInstructions: values.arrivalInstructions || undefined,
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

  const activeLinkByVisitorId = useMemo(() => {
    const map = new Map<string, VisitGuestLink>()
    guestLinks.forEach((link) => {
      if (link.revoked) return
      const current = map.get(link.visitorId)
      if (!current || link.expiresAt > current.expiresAt) {
        map.set(link.visitorId, link)
      }
    })
    return map
  }, [guestLinks])

  const feedbackAverage = useMemo(() => averageRating(feedbacks), [feedbacks])

  const buildSnapshot = useCallback(
    (visitor: Visitor): GuestLinkSnapshot | null => {
      if (!visit) return null
      return {
        visitTitle: visit.title,
        startDate: visit.startDate,
        endDate: visit.endDate,
        visitorName: visitor.name,
        company: visitor.company ?? visit.company,
        city: visit.city,
        arrivalInstructions: visit.arrivalInstructions,
        agenda: buildGuestAgenda(activities),
      }
    },
    [visit, activities],
  )

  const copyPortalUrl = async (token: string) => {
    const url = buildGuestPortalUrl(token)
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link do portal copiado')
    } catch {
      toast.error(`Copie manualmente: ${url}`)
    }
  }

  const handleGenerateGuestLink = async (visitor: Visitor) => {
    if (!user || !id || !visit) return
    const snapshot = buildSnapshot(visitor)
    if (!snapshot) return
    setPortalBusyId(visitor.id)
    try {
      const link = await createGuestLink({
        ...snapshot,
        visitId: id,
        visitorId: visitor.id,
        ownerId: user.uid,
        createdBy: user.uid,
      })
      setGuestLinks((prev) => [link, ...prev])
      await copyPortalUrl(link.token)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível gerar o link do portal')
    } finally {
      setPortalBusyId(null)
    }
  }

  const handleRefreshGuestLink = async (link: VisitGuestLink, visitor: Visitor) => {
    const snapshot = buildSnapshot(visitor)
    if (!snapshot) return
    setPortalBusyId(link.id)
    try {
      await refreshGuestLinkSnapshot(link.id, snapshot)
      setGuestLinks((prev) =>
        prev.map((item) => (item.id === link.id ? { ...item, ...snapshot } : item)),
      )
      toast.success('Dados do portal atualizados')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível atualizar o portal')
    } finally {
      setPortalBusyId(null)
    }
  }

  const handleRevokeGuestLink = async (link: VisitGuestLink) => {
    setPortalBusyId(link.id)
    try {
      await revokeLink(link.id)
      setGuestLinks((prev) =>
        prev.map((item) => (item.id === link.id ? { ...item, revoked: true } : item)),
      )
      toast.success('Link revogado')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível revogar o link')
    } finally {
      setPortalBusyId(null)
    }
  }

  const handleApplyGuestDraft = async (link: VisitGuestLink) => {
    setPortalBusyId(link.id)
    try {
      await applyVisitorDraft(link.id, link.visitorId)
      toast.success('Dados do visitante atualizados')
      await load()
    } catch (error) {
      console.error(error)
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível aplicar os dados',
      )
    } finally {
      setPortalBusyId(null)
    }
  }

  const openPlaybookDialog = async () => {
    if (!user) return
    try {
      const items = await listPlaybooks(user.uid, isAdmin)
      setPlaybooks(items)
      setSelectedPlaybookId(items[0]?.id ?? '')
      setPlaybookOpen(true)
      if (items.length === 0) {
        toast.error('Crie um playbook em Configurações antes de aplicar')
      }
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível carregar os playbooks')
    }
  }

  const handleApplyPlaybook = async () => {
    if (!user || !id || !visit || !selectedPlaybookId) return
    setApplyingPlaybook(true)
    try {
      const result = await applyPlaybookToVisit({
        playbookId: selectedPlaybookId,
        visitId: id,
        ownerId: user.uid,
        startDate: visit.startDate,
        isAdmin,
        actorId: user.uid,
        actorName: profile?.name,
      })
      toast.success(
        `Playbook aplicado: ${result.tasks} tarefa(s), ${result.activities} atividade(s), ${result.documents} documento(s)`,
      )
      setPlaybookOpen(false)
      await load()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível aplicar o playbook')
    } finally {
      setApplyingPlaybook(false)
    }
  }

  const handleSaveAsPlaybook = () => {
    if (!user || !id) return
    setCloning(true)
    void saveVisitAsPlaybook(id, user.uid, isAdmin)
      .then(() => toast.success('Playbook salvo em Configurações'))
      .catch((error) => {
        console.error(error)
        toast.error('Não foi possível salvar como playbook')
      })
      .finally(() => setCloning(false))
  }

  const handleToggleChecklistTask = async (task: Task) => {
    if (!canWrite) return
    setTogglingTaskId(task.id)
    const nextStatus = task.status === 'completed' ? 'backlog' : 'completed'
    try {
      await updateTask(task.id, { status: nextStatus })
      setTasks((prev) =>
        prev.map((item) => (item.id === task.id ? { ...item, status: nextStatus } : item)),
      )
      setPendingTasks((prev) =>
        nextStatus === 'completed' ? Math.max(0, prev - 1) : prev + 1,
      )
      if (visit) {
        const nextTasks = tasks.map((item) =>
          item.id === task.id ? { ...item, status: nextStatus } : item,
        )
        const progress = calculateVisitProgress(nextTasks)
        setVisit((prev) => (prev ? { ...prev, progress } : prev))
        await syncVisitProgress(visit.id, progress).catch(console.error)
      }
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível atualizar a tarefa')
    } finally {
      setTogglingTaskId(null)
    }
  }

  const tasksByPhase = useMemo(() => {
    const group = (phase: PlaybookPhase) =>
      tasks.filter((task) => (task.phase ?? 'durante') === phase)
    return {
      preparacao: group('preparacao'),
      encerramento: group('encerramento'),
    }
  }, [tasks])

  const activitiesByPhase = useMemo(() => {
    const group = (phase: PlaybookPhase) =>
      activities.filter((activity) => (activity.phase ?? 'durante') === phase)
    return {
      preparacao: group('preparacao'),
      encerramento: group('encerramento'),
    }
  }, [activities])

  const pendingPlaceholders = useMemo(
    () => unmatchedPlaceholders(placeholders, documents),
    [placeholders, documents],
  )

  const placeholdersByPhase = useMemo(() => {
    const group = (phase: PlaybookPhase) =>
      pendingPlaceholders.filter((item) => (item.phase ?? 'durante') === phase)
    return {
      preparacao: group('preparacao'),
      encerramento: group('encerramento'),
    }
  }, [pendingPlaceholders])

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

  const visitDraftContext = () => {
    if (!visit) return {}
    return {
      title: visit.title,
      company: visit.company,
      startDate: visit.startDate,
      endDate: visit.endDate,
      status: visit.status,
      objective: visit.objective,
      visitorCount: linkedVisitors.length,
      pendingTasks,
      financeTotal: formatCurrency(financeTotal),
    }
  }

  const openEmailDialog = () => {
    if (!visit) return
    setEmailSubject(`Resumo da visita: ${visit.title}`)
    setEmailBody(emailSummary)
    setEmailOpen(true)
  }

  const applySimpleEmailSummary = () => {
    if (!visit) return
    setEmailSubject(`Resumo da visita: ${visit.title}`)
    setEmailBody(emailSummary)
  }

  const generateEmailDraft = async (kind: 'visit_summary' | 'internal_briefing') => {
    if (!visit) return
    setDraftingEmail(true)
    try {
      const draft = await draftCommunication({
        kind,
        visitContext: visitDraftContext(),
      })
      if (draft.subject) setEmailSubject(draft.subject)
      setEmailBody(draft.body)
      toast.success(kind === 'internal_briefing' ? 'Briefing gerado' : 'Resumo gerado com IA')
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Não foi possível gerar o rascunho')
    } finally {
      setDraftingEmail(false)
    }
  }

  const openGuestInviteDraft = async (visitorName: string, token: string) => {
    if (!visit) return
    setGuestInviteLabel(visitorName)
    setGuestInviteBody('')
    setGuestInviteOpen(true)
    setDraftingGuestInvite(true)
    try {
      const draft = await draftCommunication({
        kind: 'guest_invite',
        visitContext: {
          ...visitDraftContext(),
          visitorName,
          portalUrl: buildGuestPortalUrl(token),
        },
      })
      setGuestInviteBody(draft.body)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Não foi possível gerar a mensagem')
      setGuestInviteBody(
        `Olá${visitorName ? `, ${visitorName}` : ''}!\n\nSegue o link do portal da visita "${visit.title}":\n${buildGuestPortalUrl(token)}`,
      )
    } finally {
      setDraftingGuestInvite(false)
    }
  }

  const handleSendEmail = async () => {
    if (!visit || !user) return
    setSendingEmail(true)
    try {
      const mode = await sendVisitSummaryEmail({
        to: emailTo,
        subject: emailSubject.trim() || `Resumo da visita: ${visit.title}`,
        body: emailBody.trim() || emailSummary,
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
            <Button variant="outline" className="w-full sm:w-auto" onClick={openEmailDialog}>
              <Mail className="h-4 w-4" />
              Enviar resumo
            </Button>
            {canWrite ? (
              <>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={!user}
                  onClick={() => void openPlaybookDialog()}
                >
                  <ClipboardList className="h-4 w-4" />
                  Aplicar playbook
                </Button>
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
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={cloning || !user}
                  onClick={handleSaveAsPlaybook}
                >
                  <ClipboardList className="h-4 w-4" />
                  Salvar como playbook
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

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {(
          [
            {
              key: 'preparacao' as const,
              title: 'Checklist de preparação',
              tasks: tasksByPhase.preparacao,
              activities: activitiesByPhase.preparacao,
              docs: placeholdersByPhase.preparacao,
            },
            {
              key: 'encerramento' as const,
              title: 'Checklist de encerramento',
              tasks: tasksByPhase.encerramento,
              activities: activitiesByPhase.encerramento,
              docs: placeholdersByPhase.encerramento,
            },
          ] as const
        ).map((block) => {
          const empty =
            block.tasks.length === 0 &&
            block.activities.length === 0 &&
            block.docs.length === 0
          return (
            <Card key={block.key}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{block.title}</CardTitle>
                {isNavAllowed('/planejamento', role, isAdmin, profile?.modulePermissions) ? (
                  <Link
                    to={`/planejamento?visita=${visit.id}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Ver no Planejamento
                  </Link>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {empty ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum item nesta fase. Aplique um playbook ou crie tarefas com fase.
                  </p>
                ) : null}
                {block.tasks.map((task) => (
                  <label
                    key={task.id}
                    className="flex items-start gap-3 rounded-lg border px-3 py-2"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={task.status === 'completed'}
                      disabled={!canWrite || togglingTaskId === task.id}
                      onCheckedChange={() => void handleToggleChecklistTask(task)}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={
                          task.status === 'completed'
                            ? 'text-sm text-muted-foreground line-through'
                            : 'text-sm font-medium'
                        }
                      >
                        {task.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {task.dueDate ? `Prazo: ${formatDate(task.dueDate)}` : 'Sem prazo'}
                        {task.assigneeName ? ` · ${task.assigneeName}` : ''}
                      </p>
                    </div>
                  </label>
                ))}
                {block.activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="rounded-lg border border-dashed px-3 py-2 text-sm"
                  >
                    <p className="font-medium">{activity.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Atividade · {formatDate(activity.date)}
                      {activity.location ? ` · ${activity.location}` : ''}
                    </p>
                  </div>
                ))}
                {block.docs.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.category}</p>
                    </div>
                    <Badge variant="outline">Arquivo pendente</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        })}
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
              <div className="space-y-2">
                <Label>Instruções de chegada</Label>
                <Textarea
                  {...form.register('arrivalInstructions')}
                  rows={3}
                  placeholder="Endereço da portaria, documentos necessários, horário de acesso..."
                />
                <p className="text-xs text-muted-foreground">
                  Exibido no portal do visitante.
                </p>
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
                <div><dt className="text-muted-foreground">Instruções de chegada</dt><dd className="whitespace-pre-line">{visit.arrivalInstructions || '—'}</dd></div>
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
              {pendingPlaceholders.length > 0 ? (
                <ul className="space-y-2">
                  {pendingPlaceholders.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.category}</p>
                        </div>
                      </div>
                      <Badge variant="outline">Pendente</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
              {documents.length === 0 && placeholders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum documento. Requer Firebase Storage habilitado.
                </p>
              ) : documents.length === 0 ? null : (
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
              ) : documents.length === 0 && placeholders.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum documento.</p>
              ) : (
                <ul className="space-y-2">
                  {pendingPlaceholders.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="truncate font-medium">{item.title}</p>
                      </div>
                      <Badge variant="outline">Pendente</Badge>
                    </li>
                  ))}
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

      {canWrite ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Portal do visitante</CardTitle>
            <p className="text-sm text-muted-foreground">
              Gere um link público para cada visitante confirmar presença, revisar dados e
              acessar a programação.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {linkedVisitors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Vincule visitantes à visita para gerar links do portal.
              </p>
            ) : (
              linkedVisitors.map((visitor) => {
                const link = activeLinkByVisitorId.get(visitor.id)
                const availability = link ? getGuestLinkAvailability(link) : null
                const busy = portalBusyId === visitor.id || portalBusyId === link?.id
                const pendingDraft = link ? hasPendingGuestDraft(link) : false

                return (
                  <div
                    key={visitor.id}
                    className="space-y-3 rounded-lg border px-3 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{visitor.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {visitor.company || visitor.document}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {link ? <GuestStatusBadge link={link} /> : null}
                        {availability === 'expired' ? (
                          <Badge variant="outline">Link expirado</Badge>
                        ) : null}
                        {pendingDraft ? (
                          <Badge variant="warning">Atualização pendente</Badge>
                        ) : null}
                      </div>
                    </div>

                    {!link ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void handleGenerateGuestLink(visitor)}
                      >
                        <Link2 className="h-4 w-4" />
                        {busy ? 'Gerando...' : 'Gerar link'}
                      </Button>
                    ) : (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="shrink-0 rounded-lg border border-dashed p-2">
                          <QRCodeSVG value={buildGuestPortalUrl(link.token)} size={88} />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={buildGuestPortalUrl(link.token)}
                              className="font-mono text-xs"
                            />
                            <Button
                              size="icon"
                              variant="outline"
                              aria-label="Copiar link"
                              onClick={() => void copyPortalUrl(link.token)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Válido até {formatDate(link.expiresAt)}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {pendingDraft ? (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => void handleApplyGuestDraft(link)}
                              >
                                <DownloadCloud className="h-4 w-4" />
                                Aplicar dados do portal
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy || draftingGuestInvite}
                              onClick={() => void openGuestInviteDraft(visitor.name, link.token)}
                            >
                              <Sparkles className="h-4 w-4" />
                              Gerar mensagem
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void handleRefreshGuestLink(link, visitor)}
                            >
                              <RefreshCcw className="h-4 w-4" />
                              Atualizar dados
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void handleRevokeGuestLink(link)}
                            >
                              <Ban className="h-4 w-4" />
                              Revogar
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Avaliações do portal</CardTitle>
          {feedbackAverage != null ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              <Star className="h-4 w-4 text-primary" />
              {feedbackAverage.toFixed(1)} / 5 · {feedbacks.length} resposta(s)
            </span>
          ) : null}
        </CardHeader>
        <CardContent>
          {feedbacks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma avaliação enviada pelo portal ainda.
            </p>
          ) : (
            <ul className="space-y-2">
              {feedbacks.map((feedback) => (
                <li key={feedback.id} className="rounded-lg border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{feedback.rating} / 5</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(feedback.submittedAt)}
                    </span>
                  </div>
                  {feedback.comment ? (
                    <p className="mt-1 whitespace-pre-line text-muted-foreground">
                      {feedback.comment}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar resumo por e-mail</DialogTitle>
            <DialogDescription>
              Edite o texto ou gere um rascunho com IA antes de enviar.
            </DialogDescription>
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
              <Label>Assunto</Label>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                disabled={draftingEmail}
              />
            </div>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                rows={10}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                disabled={draftingEmail}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={draftingEmail}
                onClick={() => void generateEmailDraft('visit_summary')}
              >
                <Sparkles className="h-4 w-4" />
                {draftingEmail ? 'Gerando…' : 'Gerar com IA'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={draftingEmail}
                onClick={() => void generateEmailDraft('internal_briefing')}
              >
                Briefing interno
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={draftingEmail}
                onClick={applySimpleEmailSummary}
              >
                Usar resumo simples
              </Button>
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
              <Button
                onClick={() => void handleSendEmail()}
                disabled={sendingEmail || draftingEmail || !emailBody.trim()}
              >
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

      <Dialog open={guestInviteOpen} onOpenChange={setGuestInviteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mensagem para o portal</DialogTitle>
            <DialogDescription>
              {guestInviteLabel
                ? `Rascunho para ${guestInviteLabel}. Copie e envie por e-mail ou WhatsApp.`
                : 'Copie e envie por e-mail ou WhatsApp.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              rows={10}
              value={guestInviteBody}
              onChange={(e) => setGuestInviteBody(e.target.value)}
              disabled={draftingGuestInvite}
              placeholder={draftingGuestInvite ? 'Gerando mensagem…' : ''}
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setGuestInviteOpen(false)}>
                Fechar
              </Button>
              <Button
                type="button"
                disabled={!guestInviteBody.trim() || draftingGuestInvite}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(guestInviteBody)
                    toast.success('Mensagem copiada')
                  } catch {
                    toast.error('Não foi possível copiar')
                  }
                }}
              >
                <Copy className="h-4 w-4" />
                Copiar mensagem
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={playbookOpen} onOpenChange={setPlaybookOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar playbook</DialogTitle>
            <DialogDescription>
              Os itens serão adicionados a esta visita. Nada existente será substituído.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {playbooks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum playbook cadastrado. Crie um em Configurações.
              </p>
            ) : (
              <div className="space-y-2">
                <Label>Playbook</Label>
                <Select value={selectedPlaybookId} onValueChange={setSelectedPlaybookId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {playbooks.map((playbook) => (
                      <SelectItem key={playbook.id} value={playbook.id}>
                        {playbook.name}
                        {playbook.visitType ? ` · ${playbook.visitType}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {taskCount > 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
                Esta visita já tem {taskCount} tarefa(s). O playbook vai adicionar itens, não
                substituir os atuais.
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPlaybookOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={applyingPlaybook || !selectedPlaybookId}
                onClick={() => void handleApplyPlaybook()}
              >
                {applyingPlaybook ? 'Aplicando...' : 'Aplicar'}
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

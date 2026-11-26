import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { toast } from 'sonner'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Copy,
  FolderOpen,
  ImagePlus,
  LogIn,
  Maximize2,
  MoreVertical,
  Pencil,
  Plus,
  Save,
  Shield,
  Trash2,
  Users,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SafeLogo } from '@/components/SafeLogo'
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/shared/ConfirmDeleteDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { canCreateOrganization } from '@/lib/access'
import {
  ACCOUNT_TYPE_OPTIONS,
  accountTypeLabel,
  resolveDisplayedAccountType,
  type AccountType,
} from '@/lib/accountType'
import { usesValeDashboard } from '@/lib/orgDashboard'
import { changeUserAccountType } from '@/services/accountType'
import { listUsers, updateUserProfile } from '@/services/users'
import {
  cancelInvite,
  createInvite,
  listInvitesByOrg,
  subscribePendingInvitesByOrg,
} from '@/services/invites'
import {
  removeOrganizationLogo,
  uploadOrganizationLogo,
} from '@/services/orgLogo'
import {
  countPendingInvites,
  getOrganization,
  listOrganizationMembers,
  listOrganizations,
  moveOrganizationMember,
  removeOrganizationMember,
  softDeleteOrganization,
  subscribeOrganizationMembers,
  updateOrganization,
  updateOrganizationMember,
} from '@/services/organizations'
import type {
  Invite,
  Organization,
  OrganizationMember,
  OrganizationStatus,
  UserProfile,
} from '@/types'

const ROLE_LABEL: Record<OrganizationMember['orgRole'], string> = {
  org_admin: 'Admin da empresa',
  user: 'Usuário',
  team: 'Equipe',
  client: 'Cliente',
}

/** Labels do gráfico "Por tipo de usuário". */
const ROLE_BAR_LABEL: Record<OrganizationMember['orgRole'], string> = {
  org_admin: 'Admins',
  user: 'Usuário',
  team: 'Equipe',
  client: 'Cliente',
}

const ROLE_BAR_ORDER: OrganizationMember['orgRole'][] = [
  'org_admin',
  'user',
  'team',
  'client',
]

const ROLE_BAR_COLORS = ['#4ade80', '#38bdf8', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c']
const CHART_LABEL_COLOR = 'rgba(226, 232, 240, 0.72)'
const MEMBERS_PAGE_SIZE = 20

function buildRoleBarOption(rows: { name: string; value: number }[]) {
  const data = rows.length ? rows : [{ name: 'Sem membros', value: 0 }]
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: { name: string; value: number }[]) => {
        const item = params[0]
        if (!item) return ''
        return `${item.name}: ${item.value}`
      },
    },
    grid: { left: 4, right: 28, top: 4, bottom: 4, containLabel: true },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { fontSize: 10, color: CHART_LABEL_COLOR },
      axisLine: { lineStyle: { color: 'rgba(226, 232, 240, 0.2)' } },
      splitLine: { lineStyle: { color: 'rgba(226, 232, 240, 0.08)' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: data.map((row) => row.name),
      axisLabel: { fontSize: 11, color: CHART_LABEL_COLOR },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 16,
        data: data.map((row, index) => ({
          value: row.value,
          itemStyle: {
            color: ROLE_BAR_COLORS[index % ROLE_BAR_COLORS.length],
            borderRadius: [0, 999, 999, 0],
          },
        })),
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          color: CHART_LABEL_COLOR,
        },
      },
    ],
  }
}

function OrgTitleLogo({ logoUrl, name }: { logoUrl?: string; name: string }) {
  const [failed, setFailed] = useState(false)
  const src = logoUrl?.trim() || ''

  useEffect(() => {
    setFailed(false)
  }, [src])

  return (
    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary">
      {src && !failed ? (
        <img
          src={src}
          alt={`Logo ${name}`}
          className="h-full w-full rounded-xl object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <FolderOpen className="h-5 w-5" />
      )}
    </div>
  )
}

function MemberRowAvatar({ photoURL, name }: { photoURL?: string; name: string }) {
  const [failed, setFailed] = useState(false)
  const src = photoURL?.trim() || ''

  useEffect(() => {
    setFailed(false)
  }, [src])

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#0f2f2a]/[0.08] text-primary">
      {src && !failed ? (
        <img
          src={src}
          alt={`Foto de ${name}`}
          className="h-full w-full rounded-xl object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Users className="h-4 w-4" />
      )}
    </div>
  )
}

const MASTER_RESERVED_ORG_SLUGS = new Set([
  'pastas',
  'administradores',
  'usuarios',
  'perfil',
  'lixeira',
  'configuracoes',
])

export function OrganizationDetailPage() {
  const { orgId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { user, isPlatformAdmin } = useAuth()
  const { setActiveOrgId, activeOrgId, refreshOrg } = useOrg()
  const navigate = useNavigate()
  const dadosCardRef = useRef<HTMLDivElement>(null)
  const focusedAdminOnce = useRef(false)

  const [loading, setLoading] = useState(true)
  const [editingDados, setEditingDados] = useState(false)
  const [ocupacaoMaxHeight, setOcupacaoMaxHeight] = useState<number>()
  const [saving, setSaving] = useState(false)
  const [org, setOrg] = useState<Organization | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [pending, setPending] = useState(0)
  const [name, setName] = useState('')
  const [maxUsers, setMaxUsers] = useState('10')
  const [status, setStatus] = useState<OrganizationStatus>('active')

  const [adminEmail, setAdminEmail] = useState('')
  const [invitingAdmin, setInvitingAdmin] = useState(false)
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([])
  const [lastAdminInvite, setLastAdminInvite] = useState<{
    id: string
    link: string
    email: string
    emailSent: boolean
  } | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoModalOpen, setLogoModalOpen] = useState(false)
  const [inviteAdminModalOpen, setInviteAdminModalOpen] = useState(false)
  const [rolesModalOpen, setRolesModalOpen] = useState(false)
  const [membersPage, setMembersPage] = useState(0)
  const [orgOptions, setOrgOptions] = useState<Organization[]>([])
  const [editMember, setEditMember] = useState<OrganizationMember | null>(null)
  const [editName, setEditName] = useState('')
  const [editAccountType, setEditAccountType] = useState<AccountType>('user')
  const [editOrgId, setEditOrgId] = useState('')
  const [savingMember, setSavingMember] = useState(false)
  const removeDialog = useConfirmDelete<OrganizationMember>()
  const deleteOrgDialog = useConfirmDelete<Organization>()

  const load = useCallback(async () => {
    if (!orgId || MASTER_RESERVED_ORG_SLUGS.has(orgId)) return
    setLoading(true)
    try {
      const [organization, memberList, pendingCount, invites, userList] = await Promise.all([
        getOrganization(orgId),
        listOrganizationMembers(orgId),
        countPendingInvites(orgId),
        listInvitesByOrg(orgId),
        listUsers(true).catch((error) => {
          console.error(error)
          return [] as UserProfile[]
        }),
      ])
      if (!organization || organization.isDeleted) {
        toast.error(
          organization?.isDeleted ? 'Esta pasta está na lixeira' : 'Pasta não encontrada',
        )
        navigate('/empresas', { replace: true })
        return
      }
      setOrg(organization)
      setMembers(memberList)
      setProfiles(userList)
      setPending(pendingCount)
      setPendingInvites(invites.filter((invite) => invite.status === 'pending'))
      setName(organization.name)
      setMaxUsers(String(organization.maxUsers))
      setStatus(organization.status)

      try {
        setOrgOptions(await listOrganizations())
      } catch (error) {
        console.error(error)
      }
    } finally {
      setLoading(false)
    }
  }, [navigate, orgId])

  useEffect(() => {
    if (!canCreateOrganization(isPlatformAdmin)) return
    void load()
  }, [isPlatformAdmin, load])

  useEffect(() => {
    if (!orgId || !canCreateOrganization(isPlatformAdmin)) return
    const unsubscribeMembers = subscribeOrganizationMembers(
      orgId,
      (nextMembers) => setMembers(nextMembers),
      (error) => console.error('Não foi possível acompanhar os membros', error),
    )
    const unsubscribeInvites = subscribePendingInvitesByOrg(
      orgId,
      (nextInvites) => {
        setPending(nextInvites.length)
        setPendingInvites(nextInvites)
      },
      (error) => console.error('Não foi possível acompanhar os convites', error),
    )
    return () => {
      unsubscribeMembers()
      unsubscribeInvites()
    }
  }, [isPlatformAdmin, orgId])

  useEffect(() => {
    focusedAdminOnce.current = false
  }, [orgId])

  useEffect(() => {
    if (loading || !org || focusedAdminOnce.current) return
    if (searchParams.get('focus') !== 'admin') return
    focusedAdminOnce.current = true
    setAdminEmail('')
    setLastAdminInvite(null)
    setInviteAdminModalOpen(true)
  }, [loading, org, searchParams])

  useEffect(() => {
    const el = dadosCardRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const syncHeight = () => {
      const next = Math.round(el.getBoundingClientRect().height)
      setOcupacaoMaxHeight((prev) => (prev === next ? prev : next))
    }

    syncHeight()
    const observer = new ResizeObserver(syncHeight)
    observer.observe(el)
    window.addEventListener('resize', syncHeight)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncHeight)
    }
  }, [loading, org, editingDados, logoBusy])

  const used = members.length + pending
  const cap = Math.max(1, (org?.maxUsers ?? Number(maxUsers)) || 1)
  const pct = Math.min(100, Math.round((used / cap) * 100))
  const seatsFull = used >= cap

  const gaugeOption = useMemo(
    () => ({
      series: [
        {
          type: 'gauge',
          center: ['50%', '60%'],
          radius: '95%',
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: cap,
          splitNumber: Math.min(cap, 5),
          pointer: { show: true, length: '58%', width: 4 },
          axisLine: {
            lineStyle: {
              width: 14,
              color: [
                [0.7, '#1a6b4a'],
                [0.9, '#d4a017'],
                [1, '#b42318'],
              ],
            },
          },
          splitLine: { length: 10, lineStyle: { width: 2 } },
          axisTick: { show: false },
          axisLabel: {
            distance: 18,
            fontSize: 10,
            formatter: (value: number) => String(Math.round(value)),
          },
          detail: {
            valueAnimation: true,
            formatter: () => `${used}/${cap}`,
            fontSize: 20,
            offsetCenter: [0, '48%'],
            color: 'inherit',
          },
          data: [{ value: Math.min(used, cap) }],
        },
      ],
    }),
    [cap, used],
  )

  const roleCounts = useMemo(() => {
    const counts = members.reduce<Record<string, number>>((acc, member) => {
      acc[member.orgRole] = (acc[member.orgRole] ?? 0) + 1
      return acc
    }, {})

    const orderedKnown = ROLE_BAR_ORDER.filter((role) => (counts[role] ?? 0) > 0).map(
      (role) => ({
        name: ROLE_BAR_LABEL[role],
        value: counts[role] ?? 0,
      }),
    )
    const extras = Object.entries(counts)
      .filter(([role]) => !ROLE_BAR_ORDER.includes(role as OrganizationMember['orgRole']))
      .map(([role, value]) => ({
        name: ROLE_LABEL[role as OrganizationMember['orgRole']] ?? role,
        value,
      }))
    return [...orderedKnown, ...extras]
  }, [members])

  const roleBarOption = useMemo(() => buildRoleBarOption(roleCounts), [roleCounts])
  const roleBarChartHeight = Math.max(96, (roleCounts.length || 1) * 32 + 16)

  const accessRows = useMemo(
    () => [
      ...members.map((member) => ({ kind: 'member' as const, member })),
      ...pendingInvites.map((invite) => ({ kind: 'invite' as const, invite })),
    ],
    [members, pendingInvites],
  )
  const membersTotalPages = Math.max(1, Math.ceil(accessRows.length / MEMBERS_PAGE_SIZE))
  const membersPageSafe = Math.min(membersPage, membersTotalPages - 1)
  const pagedAccessRows = useMemo(
    () =>
      accessRows.slice(
        membersPageSafe * MEMBERS_PAGE_SIZE,
        membersPageSafe * MEMBERS_PAGE_SIZE + MEMBERS_PAGE_SIZE,
      ),
    [accessRows, membersPageSafe],
  )

  useEffect(() => {
    setMembersPage(0)
  }, [orgId])

  useEffect(() => {
    if (membersPage > membersTotalPages - 1) {
      setMembersPage(Math.max(0, membersTotalPages - 1))
    }
  }, [membersPage, membersTotalPages])

  const handleSave = async () => {
    if (!orgId || !name.trim()) return
    const parsedMax = Number(maxUsers)
    if (!Number.isFinite(parsedMax) || parsedMax < 1) {
      toast.error('Limite de acessos inválido')
      return
    }
    if (parsedMax < used) {
      toast.error(`O limite não pode ser menor que os ${used} acessos já utilizados`)
      return
    }
    setSaving(true)
    try {
      await updateOrganization(orgId, {
        name: name.trim(),
        maxUsers: parsedMax,
        status,
      })
      toast.success('Pasta atualizada')
      setEditingDados(false)
      await load()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível salvar')
    } finally {
      setSaving(false)
    }
  }

  const enterSystem = () => {
    if (!orgId) return
    setActiveOrgId(orgId)
    navigate('/')
  }

  const handleLogoUpload = async (file: File | null) => {
    if (!orgId || !file) return
    setLogoBusy(true)
    try {
      const result = await uploadOrganizationLogo(orgId, file)
      setOrg((prev) =>
        prev
          ? { ...prev, logoUrl: result.logoUrl, logoStoragePath: result.logoStoragePath }
          : prev,
      )
      if (activeOrgId === orgId) await refreshOrg()
      toast.success('Whitelabel atualizado — funcionários herdam esta logo')
    } catch (error) {
      console.error(error)
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível enviar a logo',
      )
    } finally {
      setLogoBusy(false)
    }
  }

  const handleLogoRemove = async () => {
    if (!orgId) return
    setLogoBusy(true)
    try {
      await removeOrganizationLogo(orgId)
      setOrg((prev) =>
        prev ? { ...prev, logoUrl: undefined, logoStoragePath: undefined } : prev,
      )
      if (activeOrgId === orgId) await refreshOrg()
      toast.success('Logo removida — volta a identidade Vale')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível remover a logo')
    } finally {
      setLogoBusy(false)
    }
  }

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(label)
      toast.success(`${label} copiado`)
      window.setTimeout(() => setCopiedField(null), 2000)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  const handleInviteAdmin = async () => {
    if (!user || !orgId || !adminEmail.trim()) return
    setInvitingAdmin(true)
    try {
      const created = await createInvite({
        email: adminEmail.trim(),
        role: 'org_admin',
        createdBy: user.uid,
        orgId,
      })
      setLastAdminInvite({
        id: created.id,
        link: created.link,
        email: created.email,
        emailSent: created.emailSent,
      })
      setAdminEmail('')
      if (created.emailSent) {
        toast.success(`Convite enviado por e-mail para ${created.email}`)
      } else {
        toast.warning(
          created.emailError ||
            'Convite criado, mas o e-mail (Resend) não foi enviado — copie o link e envie',
        )
      }
      await load()
    } catch (error) {
      console.error(error)
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível convidar o administrador',
      )
    } finally {
      setInvitingAdmin(false)
    }
  }

  const handleCancelPendingInvite = async (inviteId: string) => {
    try {
      await cancelInvite(inviteId)
      toast.success('Convite cancelado')
      if (lastAdminInvite?.id === inviteId) setLastAdminInvite(null)
      await load()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível cancelar o convite')
    }
  }

  const inviteRoleLabel = (role: Invite['role']) => {
    if (role === 'org_admin') return 'Admin da empresa'
    if (role === 'team') return 'Equipe'
    if (role === 'client') return 'Cliente'
    return 'Usuário'
  }

  const openEditMember = (member: OrganizationMember) => {
    const accountType = resolveDisplayedAccountType(
      profiles.find((profile) => profile.uid === member.uid)?.role,
      member.orgRole,
    )
    setEditMember(member)
    setEditName(member.name)
    setEditAccountType(accountType)
    setEditOrgId(member.orgId)
  }

  const handleSaveMemberEdit = async () => {
    if (!editMember || !editName.trim()) {
      toast.error('Informe o nome')
      return
    }
    if (editAccountType !== 'admin_master' && !editOrgId) {
      toast.error('Selecione a pasta')
      return
    }

    setSavingMember(true)
    try {
      const nextName = editName.trim()
      let currentOrgId = editMember.orgId
      const currentType = resolveDisplayedAccountType(
        profiles.find((profile) => profile.uid === editMember.uid)?.role,
        editMember.orgRole,
      )

      if (editAccountType !== 'admin_master' && editOrgId !== currentOrgId) {
        const targetRole =
          editAccountType === 'org_admin' ||
          editAccountType === 'team' ||
          editAccountType === 'client' ||
          editAccountType === 'user'
            ? editAccountType
            : editMember.orgRole
        await moveOrganizationMember({
          fromOrgId: currentOrgId,
          toOrgId: editOrgId,
          uid: editMember.uid,
          email: editMember.email,
          name: nextName,
          orgRole: targetRole,
        })
        currentOrgId = editOrgId
      } else if (nextName !== editMember.name) {
        await updateOrganizationMember(currentOrgId, editMember.uid, { name: nextName })
        await updateUserProfile(editMember.uid, { name: nextName })
      }

      if (editAccountType !== currentType) {
        await changeUserAccountType({
          uid: editMember.uid,
          accountType: editAccountType,
          orgId: editAccountType === 'admin_master' ? undefined : currentOrgId,
        })
      }

      toast.success('Membro atualizado')
      setEditMember(null)
      if (currentOrgId !== orgId) {
        navigate(`/empresas/${currentOrgId}`)
      } else {
        await load()
      }
    } catch (error) {
      console.error(error)
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível salvar o membro',
      )
    } finally {
      setSavingMember(false)
    }
  }

  const handleRemoveMember = () => {
    void removeDialog.confirm(async (member) => {
      try {
        await removeOrganizationMember(member.orgId, member.uid)
        toast.success(
          member.orgRole === 'org_admin'
            ? 'Administrador removido da pasta'
            : 'Membro removido da pasta',
        )
        await load()
      } catch (error) {
        console.error(error)
        toast.error(
          error instanceof Error ? error.message : 'Não foi possível remover o membro',
        )
        throw error
      }
    })
  }

  const handleDeleteClient = () => {
    void deleteOrgDialog.confirm(async (organization) => {
      if (!user) return
      try {
        await softDeleteOrganization(organization.id, user.uid)
        if (activeOrgId === organization.id) {
          setActiveOrgId(null)
          await refreshOrg()
        }
        toast.success('Pasta movida para a lixeira')
        navigate('/empresas')
      } catch (error) {
        console.error(error)
        toast.error(
          error instanceof Error ? error.message : 'Não foi possível excluir a pasta',
        )
        throw error
      }
    })
  }

  if (!canCreateOrganization(isPlatformAdmin)) {
    return null
  }

  if (loading || !org) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={org.name}
        description="Configure a pasta do cliente, adicione o admin da empresa e entre no sistema de visitas e eventos."
        leading={<OrgTitleLogo logoUrl={org.logoUrl} name={org.name} />}
        actions={
          <div className="flex flex-wrap gap-2">
            {usesValeDashboard(org) ? (
              <Badge variant="secondary" className="h-9 px-3">
                Dashboard Vale
              </Badge>
            ) : null}
            <Button onClick={enterSystem} disabled={org.status !== 'active'}>
              <LogIn className="h-4 w-4" />
              Entrar no sistema do cliente
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div ref={dadosCardRef} className="lg:col-span-2">
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FolderOpen className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Dados da pasta</CardTitle>
                  <CardDescription>
                    Pessoas desta empresa só enxergam o sistema dela.
                  </CardDescription>
                </div>
              </div>
              {!editingDados ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setEditingDados(true)}
                  aria-label="Editar dados da pasta"
                  title="Editar dados da pasta"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  className="shrink-0 text-white hover:text-white"
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Salvando…' : 'Salvar alterações'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid flex-1 content-start gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <div>
                <Label>Whitelabel</Label>
                <p className="text-xs text-muted-foreground">
                  Logo da pasta no CRM e no portal. Clique na imagem para gerenciar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLogoModalOpen(true)}
                className="flex h-20 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/30 p-2 transition-colors hover:border-primary/40 hover:bg-muted/50"
                aria-label="Abrir logo da pasta"
                title="Abrir logo"
              >
                {org.logoUrl ? (
                  <SafeLogo
                    src={org.logoUrl}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <p className="text-center text-[11px] text-muted-foreground">Sem logo</p>
                )}
              </button>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="detail-name">Nome do cliente</Label>
              <Input
                id="detail-name"
                value={name}
                disabled={!editingDados}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="detail-max">Limite de acessos</Label>
              <Input
                id="detail-max"
                type="number"
                min={1}
                value={maxUsers}
                disabled={!editingDados}
                onChange={(event) => setMaxUsers(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Ex.: 10, 20 ou 3 — o Admin da empresa convida funcionários até este teto.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                disabled={!editingDados}
                onValueChange={(value) => setStatus(value as OrganizationStatus)}
              >
                <SelectTrigger disabled={!editingDados}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="suspended">Suspensa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        </div>

        <Card
          className="flex min-h-0 flex-col overflow-hidden"
          style={
            ocupacaoMaxHeight
              ? { minHeight: ocupacaoMaxHeight, height: ocupacaoMaxHeight }
              : undefined
          }
        >
          <CardHeader className="shrink-0 pb-1 pt-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Ocupação de acessos</CardTitle>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label="Ajuda sobre ocupação de acessos"
                    title="Ajuda"
                  >
                    <CircleHelp className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="max-w-xs space-y-1.5 p-3 text-sm text-muted-foreground">
                  <p>
                    {used} de {cap} utilizados
                    {pending > 0
                      ? ` (${pending} convite${pending === 1 ? '' : 's'} pendente${pending === 1 ? '' : 's'})`
                      : ''}
                    .
                  </p>
                  <p>
                    Convites pendentes ocupam vaga até a pessoa aceitar o convite. Este painel
                    apenas exibe a ocupação.
                  </p>
                </PopoverContent>
              </Popover>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden pt-0">
            <div className="shrink-0 space-y-2">
              <ReactECharts
                key={`gauge-${cap}-${used}`}
                option={gaugeOption}
                style={{ height: 140 }}
                opts={{ renderer: 'svg' }}
                notMerge
              />
              <Progress value={pct} className="h-2" />
              {pending > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Inclui {pending} convite{pending === 1 ? '' : 's'} pendente
                  {pending === 1 ? '' : 's'}
                </p>
              ) : null}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <p className="text-xs font-medium text-foreground/55">Por tipo de usuário</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setRolesModalOpen(true)}
                  aria-label="Expandir tipos de usuário"
                  title="Ver todas as categorias"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                <ReactECharts
                  key={`roles-${roleCounts.map((row) => `${row.name}:${row.value}`).join('|')}`}
                  option={roleBarOption}
                  style={{ height: roleBarChartHeight }}
                  opts={{ renderer: 'svg' }}
                  notMerge
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Users className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Membros com acesso</CardTitle>
                  <Badge variant="secondary" className="gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {members.length + pendingInvites.length}
                  </Badge>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        aria-label="Ajuda sobre membros com acesso"
                        title="Ajuda"
                      >
                        <CircleHelp className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="max-w-xs p-3 text-sm text-muted-foreground">
                      O Master pode remover acessos aqui. Use Adicionar admin para convidar o
                      administrador da pasta; depois ele convida os funcionários no menu
                      Usuários.
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  className="text-white hover:text-white"
                  disabled={seatsFull || org.status !== 'active'}
                  onClick={() => {
                    setAdminEmail('')
                    setLastAdminInvite(null)
                    setInviteAdminModalOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Adicionar admin
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {accessRows.length === 0 ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhum membro ainda. Use Adicionar admin para convidar o administrador da pasta.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/40 text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Nome</th>
                        <th className="px-4 py-2.5 font-medium">E-mail</th>
                        <th className="px-4 py-2.5 font-medium">Papel</th>
                        <th className="px-4 py-2.5 font-medium text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedAccessRows.map((row) => {
                        if (row.kind === 'member') {
                          const member = row.member
                          return (
                            <tr key={member.id} className="border-t">
                              <td className="px-4 py-2.5">
                                <div className="flex min-w-0 items-center gap-3">
                                  <MemberRowAvatar
                                    photoURL={
                                      profiles.find((profile) => profile.uid === member.uid)
                                        ?.photoURL
                                    }
                                    name={member.name}
                                  />
                                  <span className="truncate font-medium">{member.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground">{member.email}</td>
                              <td className="px-4 py-2.5">
                                <Badge variant="secondary">
                                  {accountTypeLabel(
                                    resolveDisplayedAccountType(
                                      profiles.find((profile) => profile.uid === member.uid)?.role,
                                      member.orgRole,
                                    ),
                                  )}
                                </Badge>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      aria-label={`Ações de ${member.name}`}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      className="gap-2"
                                      onClick={() => openEditMember(member)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                      Editar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="gap-2 text-destructive focus:text-destructive"
                                      onClick={() => removeDialog.requestDelete(member)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Remover
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          )
                        }

                        const invite = row.invite
                        const localName = invite.email.split('@')[0] || invite.email
                        return (
                          <tr
                            key={`invite-${invite.id}`}
                            className="border-t border-dashed bg-muted/20"
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex min-w-0 items-center gap-3">
                                <MemberRowAvatar name={localName} />
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className="truncate font-medium capitalize">{localName}</span>
                                  <Badge variant="warning">Aguardando acesso</Badge>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{invite.email}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {inviteRoleLabel(invite.role)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    aria-label={`Ações do convite ${invite.email}`}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => void handleCancelPendingInvite(invite.id)}
                                  >
                                    Cancelar convite
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={membersPageSafe <= 0}
                    onClick={() => setMembersPage((page) => Math.max(0, page - 1))}
                    aria-label="Página anterior"
                    title="Anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {membersPageSafe + 1} / {membersTotalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={membersPageSafe >= membersTotalPages - 1}
                    onClick={() =>
                      setMembersPage((page) => Math.min(membersTotalPages - 1, page + 1))
                    }
                    aria-label="Próxima página"
                    title="Próxima"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

      <div className="flex justify-center pt-2">
        <button
          type="button"
          className="text-sm text-rose-300/90 underline-offset-4 transition-colors hover:text-rose-400 hover:underline"
          onClick={() => deleteOrgDialog.requestDelete(org)}
        >
          excluir pasta inteira
        </button>
      </div>

      <Dialog open={inviteAdminModalOpen} onOpenChange={setInviteAdminModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar admin</DialogTitle>
            <DialogDescription>
              Informe o e-mail e envie o convite pelo Resend. A pessoa recebe o link: se ainda
              não tem conta, cria a senha; se já tem, entra e vira admin desta pasta.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="modal-admin-invite-email">E-mail do admin *</Label>
              <Input
                id="modal-admin-invite-email"
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                placeholder="admin@empresa.com"
                autoFocus
              />
            </div>
            {seatsFull ? (
              <p className="text-xs text-destructive">
                Limite de acessos atingido. Aumente o limite antes de convidar.
              </p>
            ) : null}
            {lastAdminInvite ? (
              <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  {lastAdminInvite.emailSent
                    ? `E-mail enviado para ${lastAdminInvite.email} via Resend.`
                    : `Convite criado para ${lastAdminInvite.email}, mas o e-mail não saiu. Use o link abaixo.`}
                </p>
                <Label htmlFor="modal-admin-invite-link">Link do convite (backup)</Label>
                <div className="flex gap-2">
                  <Input
                    id="modal-admin-invite-link"
                    readOnly
                    value={lastAdminInvite.link}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyText('Link do convite', lastAdminInvite.link)}
                  >
                    {copiedField === 'Link do convite' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteAdminModalOpen(false)}
              >
                Fechar
              </Button>
              <Button
                type="button"
                className="text-white hover:text-white"
                disabled={
                  invitingAdmin || seatsFull || org.status !== 'active' || !adminEmail.trim()
                }
                onClick={() => void handleInviteAdmin()}
              >
                <Shield className="h-4 w-4" />
                {invitingAdmin ? 'Enviando…' : 'Enviar convite'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={logoModalOpen} onOpenChange={setLogoModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Whitelabel</DialogTitle>
            <DialogDescription>
              Logo da pasta no CRM e no portal.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-48 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/30 p-4">
              {org.logoUrl ? (
                <SafeLogo
                  src={org.logoUrl}
                  alt={`Logo ${org.name}`}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <p className="text-center text-sm text-muted-foreground">Sem logo</p>
              )}
            </div>
            <div className="flex w-full flex-wrap items-center justify-center gap-2">
              <Button type="button" variant="outline" disabled={logoBusy} asChild={!logoBusy}>
                {logoBusy ? (
                  <>
                    <ImagePlus className="h-4 w-4" />
                    Enviando…
                  </>
                ) : (
                  <label className="cursor-pointer">
                    <ImagePlus className="h-4 w-4" />
                    Enviar logo
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      disabled={logoBusy}
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null
                        event.target.value = ''
                        void handleLogoUpload(file)
                      }}
                    />
                  </label>
                )}
              </Button>
              {org.logoUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  disabled={logoBusy}
                  onClick={() => void handleLogoRemove()}
                  aria-label="Remover logo"
                  title="Remover logo"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rolesModalOpen} onOpenChange={setRolesModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tipos de usuário</DialogTitle>
            <DialogDescription>
              Quantidade de membros por categoria nesta pasta.
            </DialogDescription>
          </DialogHeader>
          <ReactECharts
            key={`roles-modal-${roleCounts.map((row) => `${row.name}:${row.value}`).join('|')}`}
            option={roleBarOption}
            style={{ height: Math.max(220, roleBarChartHeight + 40) }}
            opts={{ renderer: 'svg' }}
            notMerge
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editMember)}
        onOpenChange={(open) => {
          if (!open) setEditMember(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar membro</DialogTitle>
            <DialogDescription>
              Atualize nome, papel ou o vínculo com outra pasta. Ao mudar o papel, as permissões
              de módulos do tipo escolhido são aplicadas. A conta de login permanece.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-member-name">Nome *</Label>
              <Input
                id="edit-member-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                placeholder="Nome"
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input value={editMember?.email ?? ''} readOnly className="bg-muted/40" />
            </div>
            <div className="space-y-1.5">
              <Label>Papel</Label>
              <Select
                value={editAccountType}
                onValueChange={(value) => setEditAccountType(value as AccountType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editAccountType !== 'admin_master' ? (
              <div className="space-y-1.5">
                <Label>Pasta / empresa</Label>
                <Select value={editOrgId} onValueChange={setEditOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a pasta" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Administrador master não fica vinculado a uma pasta específica.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={savingMember}
                onClick={() => setEditMember(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="text-white hover:text-white"
                disabled={savingMember || !editName.trim()}
                onClick={() => void handleSaveMemberEdit()}
              >
                {savingMember ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={removeDialog.open}
        onOpenChange={removeDialog.handleOpenChange}
        title="Remover acesso desta pasta?"
        description={
          removeDialog.target
            ? `"${removeDialog.target.name}" (${removeDialog.target.email}) perderá o acesso a esta empresa. A conta de login continua existindo; só o vínculo com a pasta é removido.`
            : undefined
        }
        itemName={removeDialog.target?.name}
        confirmLabel="Remover"
        loading={removeDialog.loading}
        onConfirm={handleRemoveMember}
      />

      <ConfirmDeleteDialog
        open={deleteOrgDialog.open}
        onOpenChange={deleteOrgDialog.handleOpenChange}
        title="Excluir pasta inteira?"
        description={
          deleteOrgDialog.target
            ? `Tem certeza que deseja excluir a pasta "${deleteOrgDialog.target.name}"? Ela será movida para a lixeira e poderá ser restaurada em até 30 dias. Convites pendentes serão cancelados.`
            : undefined
        }
        itemName={deleteOrgDialog.target?.name}
        confirmLabel="Mover para lixeira"
        loading={deleteOrgDialog.loading}
        onConfirm={handleDeleteClient}
      />
    </div>
  )
}

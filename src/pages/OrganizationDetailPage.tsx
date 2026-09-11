import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Check,
  Copy,
  FolderOpen,
  KeyRound,
  LogIn,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Users,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/shared/ConfirmDeleteDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { generatePassword } from '@/lib/password'
import {
  createOrganizationAdmin,
  type CreatedOrgAdminCredentials,
} from '@/services/orgAdmins'
import {
  cancelInvite,
  createInvite,
  listInvitesByOrg,
} from '@/services/invites'
import {
  countPendingInvites,
  getOrganization,
  listOrganizationMembers,
  removeOrganizationMember,
  updateOrganization,
} from '@/services/organizations'
import type { Invite, Organization, OrganizationMember, OrganizationStatus } from '@/types'

const ROLE_LABEL: Record<OrganizationMember['orgRole'], string> = {
  org_admin: 'Admin da empresa',
  user: 'Usuário',
  team: 'Equipe',
  client: 'Cliente',
}

export function OrganizationDetailPage() {
  const { orgId = '' } = useParams()
  const { user, isPlatformAdmin } = useAuth()
  const { setActiveOrgId } = useOrg()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [org, setOrg] = useState<Organization | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [pending, setPending] = useState(0)
  const [name, setName] = useState('')
  const [maxUsers, setMaxUsers] = useState('10')
  const [status, setStatus] = useState<OrganizationStatus>('active')

  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState(() => generatePassword(8))
  const [creatingAdmin, setCreatingAdmin] = useState(false)
  const [invitingAdmin, setInvitingAdmin] = useState(false)
  const [showPasswordCreate, setShowPasswordCreate] = useState(false)
  const [pendingAdminInvites, setPendingAdminInvites] = useState<Invite[]>([])
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([])
  const [lastAdminInviteLink, setLastAdminInviteLink] = useState<string | null>(null)
  const [createdCredentials, setCreatedCredentials] =
    useState<CreatedOrgAdminCredentials | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const removeDialog = useConfirmDelete<OrganizationMember>()

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [organization, memberList, pendingCount, invites] = await Promise.all([
        getOrganization(orgId),
        listOrganizationMembers(orgId),
        countPendingInvites(orgId),
        listInvitesByOrg(orgId),
      ])
      if (!organization) {
        toast.error('Pasta não encontrada')
        navigate('/empresas', { replace: true })
        return
      }
      setOrg(organization)
      setMembers(memberList)
      setPending(pendingCount)
      setPendingAdminInvites(
        invites.filter((invite) => invite.status === 'pending' && invite.role === 'org_admin'),
      )
      setPendingInvites(invites.filter((invite) => invite.status === 'pending'))
      setName(organization.name)
      setMaxUsers(String(organization.maxUsers))
      setStatus(organization.status)
    } finally {
      setLoading(false)
    }
  }, [navigate, orgId])

  useEffect(() => {
    if (!canCreateOrganization(isPlatformAdmin)) return
    void load()
  }, [isPlatformAdmin, load])

  const orgAdmins = useMemo(
    () => members.filter((member) => member.orgRole === 'org_admin'),
    [members],
  )
  const used = members.length + pending
  const cap = (org?.maxUsers ?? Number(maxUsers)) || 1
  const pct = Math.min(100, Math.round((used / Math.max(cap, 1)) * 100))
  const seatsFull = used >= cap

  const gaugeOption = useMemo(
    () => ({
      series: [
        {
          type: 'gauge',
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: 100,
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
          axisLabel: { distance: 18, fontSize: 10 },
          detail: {
            valueAnimation: true,
            formatter: '{value}%',
            fontSize: 22,
            offsetCenter: [0, '70%'],
            color: '#0f2f2a',
          },
          data: [{ value: pct }],
        },
      ],
    }),
    [pct],
  )

  const roleChartOption = useMemo(() => {
    const counts = members.reduce<Record<string, number>>((acc, member) => {
      acc[member.orgRole] = (acc[member.orgRole] ?? 0) + 1
      return acc
    }, {})
    const data = Object.entries(counts).map(([role, value]) => ({
      name: ROLE_LABEL[role as OrganizationMember['orgRole']] ?? role,
      value,
    }))
    return {
      color: ['#0f2f2a', '#1a6b4a', '#d4a017', '#3d9b87'],
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['40%', '65%'],
          data: data.length
            ? data
            : [{ name: 'Sem membros', value: 1, itemStyle: { color: '#d8e0dc' } }],
          label: { formatter: '{b}\n{c}' },
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        },
      ],
    }
  }, [members])

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
      setLastAdminInviteLink(created.link)
      setAdminEmail('')
      toast.success('Convite de admin criado — copie o link e envie')
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

  const handleCancelAdminInvite = async (inviteId: string) => {
    try {
      await cancelInvite(inviteId)
      toast.success('Convite cancelado')
      if (lastAdminInviteLink?.includes(inviteId)) setLastAdminInviteLink(null)
      await load()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível cancelar o convite')
    }
  }

  const handleCancelAllPendingInvites = async () => {
    if (pendingInvites.length === 0) return
    try {
      await Promise.all(pendingInvites.map((invite) => cancelInvite(invite.id)))
      toast.success(`${pendingInvites.length} convite(s) cancelado(s) — vagas liberadas`)
      setLastAdminInviteLink(null)
      await load()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível cancelar todos os convites')
    }
  }

  const handleCreateAdmin = async () => {
    if (!user || !orgId) return
    setCreatingAdmin(true)
    try {
      const credentials = await createOrganizationAdmin({
        orgId,
        name: adminName,
        email: adminEmail,
        password: adminPassword,
        createdBy: user.uid,
      })
      setCreatedCredentials(credentials)
      setAdminName('')
      setAdminEmail('')
      setAdminPassword(generatePassword(8))
      toast.success('Administrador da empresa criado')
      await load()
    } catch (error) {
      console.error(error)
      const message =
        error instanceof Error ? error.message : 'Não foi possível criar o administrador'
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code)
          : ''
      if (code === 'auth/email-already-in-use') {
        toast.error('Este e-mail já possui conta. Use outro e-mail.')
      } else {
        toast.error(message)
      }
    } finally {
      setCreatingAdmin(false)
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
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/empresas">
            <ArrowLeft className="h-4 w-4" />
            Voltar às pastas
          </Link>
        </Button>
      </div>

      <PageHeader
        title={org.name}
        description="Configure a pasta do cliente, crie o admin da empresa e entre no sistema de visitas e eventos."
        actions={
          <Button onClick={enterSystem} disabled={org.status !== 'active'}>
            <LogIn className="h-4 w-4" />
            Entrar no sistema do cliente
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
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
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="detail-name">Nome do cliente</Label>
              <Input
                id="detail-name"
                value={name}
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
                onValueChange={(value) => setStatus(value as OrganizationStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="suspended">Suspensa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end sm:col-span-2">
              <Button onClick={() => void handleSave()} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ocupação de acessos</CardTitle>
            <CardDescription>
              {used} de {cap} utilizados
              {pending > 0
                ? ` (${pending} convite${pending === 1 ? '' : 's'} pendente${pending === 1 ? '' : 's'})`
                : ''}
              . Convites pendentes ocupam vaga até a pessoa criar a conta ou você cancelar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ReactECharts option={gaugeOption} style={{ height: 220 }} opts={{ renderer: 'svg' }} />
            <Progress value={pct} className="mt-2 h-2" />
            {pendingInvites.length > 0 ? (
              <div className="space-y-2 border-t pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Convites pendentes
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void handleCancelAllPendingInvites()}
                  >
                    Cancelar todos
                  </Button>
                </div>
                {pendingInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex flex-col gap-1 rounded-lg border border-dashed p-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {invite.role === 'org_admin'
                          ? 'Admin'
                          : invite.role === 'team'
                            ? 'Equipe'
                            : invite.role === 'client'
                              ? 'Cliente'
                              : 'Usuário'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void handleCancelAdminInvite(invite.id)}
                    >
                      Cancelar
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Administrador da empresa</CardTitle>
              <CardDescription>
                O Master convida o admin (gera o link e envia). Depois o admin da empresa
                convida os funcionários em Configurações → Usuários da empresa.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {orgAdmins.length > 0 ? (
            <div className="space-y-2">
              {orgAdmins.map((admin) => (
                <div
                  key={admin.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{admin.name}</p>
                    <p className="text-xs text-muted-foreground">{admin.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="success">Admin da empresa</Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeDialog.requestDelete(admin)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {pendingAdminInvites.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Convites de admin pendentes
              </p>
              {pendingAdminInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Aguardando a pessoa criar a conta
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void handleCancelAdminInvite(invite.id)}
                  >
                    Cancelar convite
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Convidar administrador</p>
            <p className="text-xs text-muted-foreground">
              Informe o e-mail, gere o link e envie. A pessoa abre o link, cria a senha e vira
              admin desta pasta.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="admin-invite-email"
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                placeholder="admin@empresa.com"
                className="sm:flex-1"
              />
              <Button
                type="button"
                disabled={
                  invitingAdmin || seatsFull || org.status !== 'active' || !adminEmail.trim()
                }
                onClick={() => void handleInviteAdmin()}
              >
                <Shield className="h-4 w-4" />
                {invitingAdmin ? 'Gerando…' : 'Gerar link de convite'}
              </Button>
            </div>
            {seatsFull ? (
              <p className="text-xs text-destructive">
                Limite de acessos atingido. Aumente o limite antes de convidar.
              </p>
            ) : null}
            {lastAdminInviteLink ? (
              <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <Label htmlFor="admin-invite-link">Link do convite (copie e envie)</Label>
                <div className="flex gap-2">
                  <Input
                    id="admin-invite-link"
                    readOnly
                    value={lastAdminInviteLink}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyText('Link do convite', lastAdminInviteLink)}
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
          </div>

          <div className="space-y-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0 text-muted-foreground"
              onClick={() => setShowPasswordCreate((v) => !v)}
            >
              {showPasswordCreate
                ? 'Ocultar criação com senha'
                : 'Ou criar login com senha temporária'}
            </Button>
            {showPasswordCreate ? (
              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="admin-name">Nome *</Label>
                  <Input
                    id="admin-name"
                    value={adminName}
                    onChange={(event) => setAdminName(event.target.value)}
                    placeholder="Nome de quem vai administrar"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-email-pass">E-mail de login *</Label>
                  <Input
                    id="admin-email-pass"
                    type="email"
                    value={adminEmail}
                    onChange={(event) => setAdminEmail(event.target.value)}
                    placeholder="admin@empresa.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-password">Senha temporária *</Label>
                  <div className="flex gap-1.5">
                    <Input
                      id="admin-password"
                      value={adminPassword}
                      onChange={(event) => setAdminPassword(event.target.value)}
                      className="font-mono"
                      maxLength={32}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      title="Gerar senha de 8 caracteres"
                      aria-label="Gerar senha"
                      onClick={() => setAdminPassword(generatePassword(8))}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    disabled={
                      creatingAdmin ||
                      seatsFull ||
                      org.status !== 'active' ||
                      !adminName.trim() ||
                      !adminEmail.trim() ||
                      adminPassword.trim().length < 8
                    }
                    onClick={() => void handleCreateAdmin()}
                  >
                    <KeyRound className="h-4 w-4" />
                    {creatingAdmin ? 'Criando…' : 'Criar login do administrador'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {createdCredentials ? (
            <div className="space-y-3 rounded-xl border border-brand/30 bg-brand/5 p-4">
              <div className="flex items-start gap-2">
                <KeyRound className="mt-0.5 h-4 w-4 text-brand" />
                <div>
                  <p className="text-sm font-medium">Login pronto para enviar</p>
                  <p className="text-xs text-muted-foreground">
                    Copie e cole para a pessoa que será o admin desta empresa. A senha só aparece
                    agora.
                  </p>
                </div>
              </div>
              <div className="grid gap-2 text-sm">
                {[
                  { label: 'Nome', value: createdCredentials.name },
                  { label: 'E-mail', value: createdCredentials.email },
                  { label: 'Senha', value: createdCredentials.password },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {row.label}
                      </p>
                      <p className="truncate font-mono text-sm">{row.value}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void copyText(row.label, row.value)}
                    >
                      {copiedField === row.label ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={() =>
                  void copyText(
                    'Login completo',
                    `Empresa: ${org.name}\nNome: ${createdCredentials.name}\nE-mail: ${createdCredentials.email}\nSenha: ${createdCredentials.password}\nAcesse o sistema e altere a senha em Perfil se desejar.`,
                  )
                }
              >
                <Copy className="h-4 w-4" />
                Copiar tudo
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Perfis na empresa</CardTitle>
            <CardDescription>Distribuição dos papéis dos membros.</CardDescription>
          </CardHeader>
          <CardContent>
            <ReactECharts option={roleChartOption} style={{ height: 260 }} opts={{ renderer: 'svg' }} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Membros com acesso</CardTitle>
                <CardDescription>
                  O Master pode remover acessos aqui. Novos funcionários entram pelo convite
                  que o admin da empresa envia em Configurações → Usuários da empresa.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3.5 w-3.5" />
                {members.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhum membro ainda. Convide o administrador da empresa acima para iniciar.
              </p>
            ) : (
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
                    {members.map((member) => (
                      <tr key={member.id} className="border-t">
                        <td className="px-4 py-2.5 font-medium">{member.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{member.email}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="secondary">{ROLE_LABEL[member.orgRole]}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => removeDialog.requestDelete(member)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remover
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
    </div>
  )
}

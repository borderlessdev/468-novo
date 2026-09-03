import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  FolderOpen,
  LogIn,
  Save,
  Users,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
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
import {
  countPendingInvites,
  getOrganization,
  listOrganizationMembers,
  updateOrganization,
} from '@/services/organizations'
import type { Organization, OrganizationMember, OrganizationStatus } from '@/types'

const ROLE_LABEL: Record<OrganizationMember['orgRole'], string> = {
  org_admin: 'Admin da empresa',
  user: 'Usuário',
  team: 'Equipe',
  client: 'Cliente',
}

export function OrganizationDetailPage() {
  const { orgId = '' } = useParams()
  const { isPlatformAdmin } = useAuth()
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

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [organization, memberList, pendingCount] = await Promise.all([
        getOrganization(orgId),
        listOrganizationMembers(orgId),
        countPendingInvites(orgId),
      ])
      if (!organization) {
        toast.error('Pasta não encontrada')
        navigate('/empresas', { replace: true })
        return
      }
      setOrg(organization)
      setMembers(memberList)
      setPending(pendingCount)
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

  const used = members.length + pending
  const cap = (org?.maxUsers ?? Number(maxUsers)) || 1
  const pct = Math.min(100, Math.round((used / Math.max(cap, 1)) * 100))

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
          data: data.length ? data : [{ name: 'Sem membros', value: 1, itemStyle: { color: '#d8e0dc' } }],
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
        description="Configure a pasta do cliente, o limite de acessos e entre no sistema de visitas e eventos desta empresa."
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
                Ex.: 10, 20 ou 3 — inclui membros ativos e convites pendentes.
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
              {pending > 0 ? ` (${pending} convite${pending === 1 ? '' : 's'} pendente${pending === 1 ? '' : 's'})` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReactECharts option={gaugeOption} style={{ height: 220 }} opts={{ renderer: 'svg' }} />
            <Progress value={pct} className="mt-2 h-2" />
          </CardContent>
        </Card>
      </div>

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
                  Só esta empresa — o restante dos acessos é gerido dentro do sistema do cliente.
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
                Nenhum membro ainda. Entre no sistema do cliente e convide usuários em Configurações
                (respeitando o limite de acessos).
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Nome</th>
                      <th className="px-4 py-2.5 font-medium">E-mail</th>
                      <th className="px-4 py-2.5 font-medium">Papel</th>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

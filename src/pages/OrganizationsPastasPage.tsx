import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowRight, FolderOpen, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { canCreateOrganization } from '@/lib/access'
import { usesValeDashboard } from '@/lib/orgDashboard'
import {
  createOrganization,
  getOrganizationSeatUsage,
  listOrganizations,
} from '@/services/organizations'
import type { Organization } from '@/types'

type OrgRow = Organization & {
  seats: number
  pending: number
}

function OrgCardLogo({ logoUrl, name }: { logoUrl?: string; name: string }) {
  const [failed, setFailed] = useState(false)
  const src = logoUrl?.trim() || ''

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return <FolderOpen className="h-5 w-5" />
  }

  return (
    <img
      src={src}
      alt={`Logo ${name}`}
      className={cn('h-full w-full object-contain p-1')}
      onError={() => setFailed(true)}
    />
  )
}

export function OrganizationsPastasPage() {
  const { user, isPlatformAdmin } = useAuth()
  const { setActiveOrgId, refreshOrg } = useOrg()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<OrgRow[]>([])
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [maxUsers, setMaxUsers] = useState('10')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const orgs = await listOrganizations()
      const enriched = await Promise.all(
        orgs.map(async (org) => {
          const { seats, pending } = await getOrganizationSeatUsage(org.id)
          return { ...org, seats, pending }
        }),
      )
      setRows(enriched)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível carregar as pastas')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canCreateOrganization(isPlatformAdmin)) return
    void load()
  }, [isPlatformAdmin, load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((org) => org.name.toLowerCase().includes(q))
  }, [rows, query])

  const enterOrganization = (orgId: string) => {
    setActiveOrgId(orgId)
    navigate('/')
  }

  const openCreate = () => {
    setName('')
    setMaxUsers('10')
    setCreateOpen(true)
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    const parsedMax = Number(maxUsers)
    if (!Number.isFinite(parsedMax) || parsedMax < 1) {
      toast.error('Informe um limite de acessos válido')
      return
    }
    setCreating(true)
    try {
      const id = await createOrganization({
        name: name.trim(),
        maxUsers: parsedMax,
        createdBy: user!.uid,
      })
      toast.success('Pasta do cliente criada')
      setName('')
      setMaxUsers('10')
      setCreateOpen(false)
      await load()
      await refreshOrg()
      navigate(`/empresas/${id}`)
    } catch (error) {
      console.error(error)
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code)
          : ''
      toast.error(
        code === 'permission-denied'
          ? 'Sem permissão para criar pasta. Confirme o login master e se as rules foram publicadas.'
          : 'Não foi possível criar a pasta',
      )
    } finally {
      setCreating(false)
    }
  }

  if (!canCreateOrganization(isPlatformAdmin)) {
    return null
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pastas dos clientes"
        description="Cliente → pasta → sistema de visitas e eventos só daquela empresa."
        actions={
          <Button className="text-white hover:text-white" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nova pasta de cliente
          </Button>
        }
      />

      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar cliente…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FolderOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">Nenhuma pasta encontrada</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {rows.length === 0
                  ? 'Crie a pasta do Cliente 1, Cliente 2… com o limite de acessos de cada um.'
                  : 'Ajuste a busca ou limpe o filtro.'}
              </p>
            </div>
            {rows.length === 0 ? (
              <Button className="text-white hover:text-white" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Criar primeira pasta
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((org) => {
            const clientNumber = rows.findIndex((row) => row.id === org.id) + 1
            const used = org.seats + org.pending
            const pct =
              org.maxUsers > 0
                ? Math.min(100, Math.round((used / org.maxUsers) * 100))
                : 0
            const atLimit = used >= org.maxUsers
            return (
              <Card
                key={org.id}
                className="group relative overflow-hidden border-border/80 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-brand to-primary/40 opacity-80" />
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#0f2f2a]/[0.08] text-primary">
                        <OrgCardLogo logoUrl={org.logoUrl} name={org.name} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                          Cliente {clientNumber}
                        </p>
                        <CardTitle className="truncate text-lg">{org.name}</CardTitle>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge variant={org.status === 'active' ? 'success' : 'muted'}>
                            {org.status === 'active' ? 'Ativa' : 'Suspensa'}
                          </Badge>
                          {usesValeDashboard(org) ? (
                            <Badge variant="secondary">Dashboard Vale</Badge>
                          ) : null}
                          {atLimit ? <Badge variant="warning">Limite atingido</Badge> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Acessos</span>
                      <span className="font-medium tabular-nums">
                        {used}/{org.maxUsers}
                        {org.pending > 0 ? (
                          <span className="text-muted-foreground"> ({org.pending} pend.)</span>
                        ) : null}
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button asChild variant="outline" className="flex-1">
                      <Link to={`/empresas/${org.id}`}>
                        Abrir pasta
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      className="flex-1 text-white hover:text-white"
                      disabled={org.status !== 'active'}
                      onClick={() => enterOrganization(org.id)}
                    >
                      Entrar no sistema
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova pasta de cliente</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Defina o nome do cliente e quantos acessos a empresa poderá usar (ex.: 10, 20 ou 3).
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="pastas-org-name">Nome do cliente *</Label>
              <Input
                id="pastas-org-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Cliente Alpha"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pastas-org-max-users">Limite de acessos *</Label>
              <Input
                id="pastas-org-max-users"
                type="number"
                min={1}
                value={maxUsers}
                onChange={(event) => setMaxUsers(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                className="text-white hover:text-white"
                disabled={creating || !name.trim()}
                onClick={() => void handleCreate()}
              >
                {creating ? 'Criando…' : 'Criar pasta'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

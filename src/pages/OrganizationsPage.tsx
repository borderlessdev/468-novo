import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Building2, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { canCreateOrganization } from '@/lib/access'
import {
  countOrganizationSeats,
  createOrganization,
  listOrganizations,
} from '@/services/organizations'

export function OrganizationsPage() {
  const { user, isPlatformAdmin } = useAuth()
  const { setActiveOrgId, refreshOrg } = useOrg()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [organizations, setOrganizations] = useState<
    Awaited<ReturnType<typeof listOrganizations>>
  >([])
  const [seatCounts, setSeatCounts] = useState<Record<string, number>>({})
  const [name, setName] = useState('')
  const [maxUsers, setMaxUsers] = useState('10')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const orgs = await listOrganizations()
      setOrganizations(orgs)
      const counts = Object.fromEntries(
        await Promise.all(
          orgs.map(async (org) => [org.id, await countOrganizationSeats(org.id)] as const),
        ),
      )
      setSeatCounts(counts)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canCreateOrganization(isPlatformAdmin)) return
    void load()
  }, [isPlatformAdmin, load])

  const enterOrganization = (orgId: string) => {
    setActiveOrgId(orgId)
    navigate('/')
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    const parsedMax = Number(maxUsers)
    if (!Number.isFinite(parsedMax) || parsedMax < 1) {
      toast.error('Informe um limite de usuários válido')
      return
    }
    setCreating(true)
    try {
      await createOrganization({
        name: name.trim(),
        maxUsers: parsedMax,
        createdBy: user!.uid,
      })
      toast.success('Empresa criada')
      setName('')
      setMaxUsers('10')
      await load()
      await refreshOrg()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível criar a empresa')
    } finally {
      setCreating(false)
    }
  }

  if (!canCreateOrganization(isPlatformAdmin)) {
    return null
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Empresas"
        description="Selecione uma pasta de trabalho ou crie uma nova empresa."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova empresa</CardTitle>
          <CardDescription>
            Defina o nome e o limite de acessos (ex.: 10, 20, 3).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Nome</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="André"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-max-users">Limite de usuários</Label>
              <Input
                id="org-max-users"
                type="number"
                min={1}
                value={maxUsers}
                onChange={(event) => setMaxUsers(event.target.value)}
              />
            </div>
          </div>
          <Button onClick={() => void handleCreate()} disabled={creating || !name.trim()}>
            <Plus className="h-4 w-4" />
            Criar empresa
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : organizations.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma empresa cadastrada ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {organizations.map((org) => (
            <Card key={org.id} className="transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{org.name}</CardTitle>
                    <CardDescription>
                      {seatCounts[org.id] ?? 0}/{org.maxUsers} usuários
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={() => enterOrganization(org.id)}>
                  Entrar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

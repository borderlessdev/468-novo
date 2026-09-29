import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Copy, ExternalLink, UserPlus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { createInvite, listPendingInvitesByOrg } from '@/services/invites'
import { listOrganizations } from '@/services/organizations'
import type { Invite, Organization } from '@/types'

/**
 * Console Master: convidar Admin da empresa (não funcionários).
 * Funcionários são convidados pelo Admin em /usuarios.
 */
export function MasterUsersPage() {
  const { user } = useAuth()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [orgId, setOrgId] = useState('')
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [lastLink, setLastLink] = useState<string | null>(null)
  const [pending, setPending] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listOrganizations()
      setOrgs(list)
      if (!orgId && list[0]) setOrgId(list[0].id)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível carregar as pastas')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!orgId) {
      setPending([])
      return
    }
    void listPendingInvitesByOrg(orgId)
      .then((invites) =>
        setPending(invites.filter((invite) => invite.role === 'org_admin')),
      )
      .catch(() => setPending([]))
  }, [orgId])

  const selectedOrg = orgs.find((o) => o.id === orgId)

  const handleInvite = async () => {
    if (!user || !orgId || !email.trim()) return
    setInviting(true)
    try {
      const created = await createInvite({
        email: email.trim(),
        role: 'org_admin',
        createdBy: user.uid,
        orgId,
      })
      setLastLink(created.link)
      setEmail('')
      toast.success('Convite de admin criado — copie o link e envie')
      const invites = await listPendingInvitesByOrg(orgId)
      setPending(invites.filter((invite) => invite.role === 'org_admin'))
    } catch (error) {
      console.error(error)
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível convidar o administrador',
      )
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        description="Como Admin Master, você convida o Admin da empresa. Depois o admin convida os funcionários no menu Usuários da pasta."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="size-5" />
            Convidar Admin da empresa
          </CardTitle>
          <CardDescription>
            Escolha a pasta do cliente, informe o e-mail do admin e envie o convite (ou
            copie o link).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando pastas…</p>
          ) : orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma pasta ainda. Crie uma em{' '}
              <Link to="/empresas" className="underline">
                Pastas de clientes
              </Link>
              .
            </p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                void handleInvite()
              }}
            >
              <div className="space-y-2">
                <Label>Pasta do cliente *</Label>
                <Select value={orgId} onValueChange={setOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="master-admin-email">E-mail do admin *</Label>
                <Input
                  id="master-admin-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@empresa.com"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={inviting || !email.trim() || !orgId}>
                  {inviting ? 'Enviando...' : 'Enviar convite'}
                </Button>
                {selectedOrg ? (
                  <Button type="button" variant="outline" asChild>
                    <Link to={`/empresas/${selectedOrg.id}`}>
                      <ExternalLink className="size-3.5" />
                      Abrir pasta
                    </Link>
                  </Button>
                ) : null}
              </div>
              {lastLink ? (
                <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                  <Label htmlFor="master-invite-link">Link do convite</Label>
                  <Input
                    id="master-invite-link"
                    readOnly
                    value={lastLink}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(lastLink)
                      toast.success('Link copiado')
                    }}
                  >
                    <Copy className="size-3.5" />
                    Copiar link
                  </Button>
                </div>
              ) : null}
            </form>
          )}
        </CardContent>
      </Card>

      {orgId && pending.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Convites de admin pendentes
              {selectedOrg ? ` · ${selectedOrg.name}` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((invite) => (
              <div key={invite.id} className="rounded-lg border border-dashed px-3 py-2 text-sm">
                <p className="font-medium">{invite.email}</p>
                <p className="text-xs text-muted-foreground">
                  Aguardando aceitar o convite (criar senha ou entrar com a conta existente)
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

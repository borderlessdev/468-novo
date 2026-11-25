import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Mail,
  Plus,
  Search,
  User,
  UserPlus,
} from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { createInvite, listPendingOrgAdminInvites } from '@/services/invites'
import { listOrganizationAdmins, listOrganizations } from '@/services/organizations'
import type { Invite, Organization, OrganizationMember } from '@/types'

type CreatedAdminInvite = {
  email: string
  link: string
  emailSent: boolean
}

type OrgAdminRow = {
  org: Organization
  admins: OrganizationMember[]
  pending: Invite[]
}

function OrgRowLogo({ logoUrl, name }: { logoUrl?: string; name: string }) {
  const src = logoUrl?.trim() || ''
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/8 text-primary">
      {src && !failed ? (
        <img
          src={src}
          alt={`Logo ${name}`}
          className="h-full w-full object-contain p-1"
          onError={() => setFailed(true)}
        />
      ) : (
        <FolderOpen className="h-4 w-4" />
      )}
    </div>
  )
}

/**
 * Console Master: roster de admins + convite por e-mail (Resend) vinculado a pasta.
 */
export function MasterUsersPage() {
  const { user } = useAuth()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [admins, setAdmins] = useState<OrganizationMember[]>([])
  const [pending, setPending] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [createdInvite, setCreatedInvite] = useState<CreatedAdminInvite | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [orgList, adminList, pendingList] = await Promise.all([
        listOrganizations(),
        listOrganizationAdmins(),
        listPendingOrgAdminInvites(),
      ])
      setOrgs(orgList)
      setAdmins(adminList)
      setPending(pendingList)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível carregar os administradores')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const inviteOrgs = useMemo(
    () => orgs.filter((org) => org.status === 'active'),
    [orgs],
  )

  const rows = useMemo<OrgAdminRow[]>(() => {
    const adminsByOrg = new Map<string, OrganizationMember[]>()
    for (const admin of admins) {
      const list = adminsByOrg.get(admin.orgId) ?? []
      list.push(admin)
      adminsByOrg.set(admin.orgId, list)
    }
    const pendingByOrg = new Map<string, Invite[]>()
    for (const invite of pending) {
      const list = pendingByOrg.get(invite.orgId) ?? []
      list.push(invite)
      pendingByOrg.set(invite.orgId, list)
    }
    return orgs.map((org) => ({
      org,
      admins: adminsByOrg.get(org.id) ?? [],
      pending: pendingByOrg.get(org.id) ?? [],
    }))
  }, [admins, orgs, pending])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(({ org, admins: orgAdmins, pending: orgPending }) => {
      if (org.name.toLowerCase().includes(q)) return true
      if (
        orgAdmins.some(
          (a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q),
        )
      ) {
        return true
      }
      return orgPending.some((invite) => invite.email.toLowerCase().includes(q))
    })
  }, [query, rows])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const rank = (row: OrgAdminRow) => {
        if (row.admins.length === 0 && row.pending.length === 0) return 0
        if (row.admins.length === 0) return 1
        return 2
      }
      const diff = rank(a) - rank(b)
      if (diff !== 0) return diff
      return a.org.name.localeCompare(b.org.name, 'pt-BR')
    })
  }, [filtered])

  const withoutAdmin = rows.filter((r) => r.admins.length === 0).length
  const pendingCount = pending.length
  const selectedOrg = orgs.find((o) => o.id === orgId)

  const openCreate = () => {
    setAdminEmail('')
    setEmailError(null)
    setCreatedInvite(null)
    setCopiedField(null)
    setOrgId(inviteOrgs[0]?.id ?? '')
    setCreateOpen(true)
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

  const handleInvite = async () => {
    if (!user || !orgId) return
    const email = adminEmail.trim()
    if (!email || !email.includes('@')) {
      setEmailError('Informe um e-mail válido.')
      return
    }
    setEmailError(null)
    setInviting(true)
    try {
      const created = await createInvite({
        email,
        role: 'org_admin',
        createdBy: user.uid,
        orgId,
      })
      setCreatedInvite({
        email: created.email,
        link: created.link,
        emailSent: created.emailSent,
      })
      if (created.emailSent) {
        toast.success(`Convite enviado para ${created.email}`)
      } else {
        toast.warning(
          created.emailError ||
            'Convite criado, mas o e-mail não foi enviado — copie o link e envie',
        )
      }
      await load()
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
        className="sm:items-start"
        title="Administradores"
        description="Lista quem administra cada pasta. Convide um admin por e-mail e vincule a uma pasta existente."
        actions={
          <Button
            type="button"
            className="shrink-0 text-white hover:text-white"
            onClick={openCreate}
            disabled={loading || inviteOrgs.length === 0}
          >
            <Plus className="h-4 w-4" />
            Criar admin
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full max-w-sm" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : orgs.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Nenhuma pasta ainda"
          description="Crie uma pasta de cliente antes de definir administradores."
          action={
            <Button asChild variant="outline">
              <Link to="/empresas/pastas">Ir para pastas</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar admin, e-mail ou pasta…"
                className="pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {withoutAdmin > 0 ? `${withoutAdmin} sem admin` : 'Todas com admin'}
              {pendingCount > 0 ? ` · ${pendingCount} convite(s) pendente(s)` : ''}
            </p>
          </div>

          {sorted.length === 0 ? (
        <EmptyState
              icon={Search}
              title="Nenhum resultado"
              description="Ajuste a busca ou limpe o filtro."
        />
      ) : (
            <div className="space-y-2">
              {sorted.map(({ org, admins: orgAdmins, pending: orgPending }) => {
                const href = `/empresas/${org.id}?focus=admin`
                const hasAdmin = orgAdmins.length > 0
                const hasPending = orgPending.length > 0
                const peopleCount = orgAdmins.length + orgPending.length

                return (
                  <Card key={org.id}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <OrgRowLogo logoUrl={org.logoUrl} name={org.name} />
                <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-medium">{org.name}</p>
                              {org.status === 'suspended' ? (
                                <Badge variant="warning">Suspensa</Badge>
                              ) : null}
                              {!hasAdmin && !hasPending ? (
                                <Badge variant="muted">Sem admin</Badge>
                              ) : null}
                            </div>
                            {peopleCount > 0 ? (
                              <p className="text-xs text-muted-foreground">
                                {orgAdmins.length > 0
                                  ? `${orgAdmins.length} admin(s)`
                                  : null}
                                {orgAdmins.length > 0 && hasPending ? ' · ' : null}
                                {hasPending
                                  ? `${orgPending.length} convite(s)`
                                  : null}
                              </p>
                            ) : (
                  <p className="text-xs text-muted-foreground">
                                Ninguém administra esta pasta ainda.
                  </p>
                            )}
                          </div>
                </div>
                <Button type="button" variant="outline" size="sm" asChild>
                          <Link to={href}>
                    <ExternalLink className="size-3.5" />
                    Abrir pasta
                  </Link>
                </Button>
                      </div>

                      {peopleCount > 0 ? (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {orgAdmins.map((admin) => (
                            <div
                              key={admin.id}
                              className="min-w-0 rounded-lg border bg-muted/20 px-3 py-2.5"
                            >
                              <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium">
                                <User className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">{admin.name}</span>
                              </p>
                              <p className="mt-1 flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                                <Mail className="size-3.5 shrink-0" />
                                <span className="truncate">{admin.email}</span>
                              </p>
                            </div>
                          ))}
                          {orgPending.map((invite) => (
                            <div
                              key={invite.id}
                              className="min-w-0 rounded-lg border border-dashed bg-muted/10 px-3 py-2.5"
                            >
                              <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                                <UserPlus className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">Convite pendente</span>
                                <Badge variant="warning" className="ml-auto shrink-0">
                                  Convite
                                </Badge>
                              </div>
                              <p className="mt-1 flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                                <Mail className="size-3.5 shrink-0" />
                                <span className="truncate">{invite.email}</span>
                              </p>
              </div>
            ))}
                        </div>
                      ) : null}
          </CardContent>
        </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setCreatedInvite(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {createdInvite ? (
                <>
                  <UserPlus className="h-5 w-5 text-brand" />
                  Adicionado administrador
                </>
              ) : (
                'Adicionar administrador'
              )}
            </DialogTitle>
            <DialogDescription>
              {createdInvite
                ? createdInvite.emailSent
                  ? 'Convite enviado por e-mail'
                  : 'Convite criado — envie o link manualmente'
                : 'Envie o convite por e-mail (Resend) e vincule a uma pasta já existente.'}
            </DialogDescription>
          </DialogHeader>

          {createdInvite ? (
            <div className="space-y-3">
              {selectedOrg ? (
                <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                  <OrgRowLogo logoUrl={selectedOrg.logoUrl} name={selectedOrg.name} />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Pasta
                    </p>
                    <p className="truncate font-medium">{selectedOrg.name}</p>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                className="w-full rounded-xl border border-brand/30 bg-brand/5 p-4 text-left transition-colors hover:bg-brand/10"
                onClick={() =>
                  void copyText(
                    'Convite',
                    `E-mail\n${createdInvite.email}\n\nLink do convite\n${createdInvite.link}`,
                  )
                }
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Mail className="h-4 w-4 text-brand" />
                    Clique para copiar
                  </div>
                  {copiedField === 'Convite' ? (
                    <Check className="h-4 w-4 text-brand" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      E-mail
                    </p>
                    <p className="font-mono break-all">{createdInvite.email}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Link do convite
                    </p>
                    <p className="font-mono break-all text-xs">{createdInvite.link}</p>
                  </div>
                </div>
              </button>
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : inviteOrgs.length === 0 ? (
            <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                Nenhuma pasta ativa disponível. Crie uma pasta antes de convidar
                administradores.
              </p>
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                void handleInvite()
              }}
            >
              <div className="space-y-2">
                <Label>Pasta do cliente *</Label>
                <Select value={orgId} onValueChange={setOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a pasta" />
                  </SelectTrigger>
                  <SelectContent>
                    {inviteOrgs.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="master-admin-email">E-mail do admin *</Label>
                {emailError ? (
                  <p id="master-admin-email-error" className="text-xs text-destructive">
                    {emailError}
                  </p>
                ) : null}
                <Input
                  id="master-admin-email"
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => {
                    setAdminEmail(e.target.value)
                    if (emailError) setEmailError(null)
                  }}
                  placeholder="admin@empresa.com"
                  autoFocus
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? 'master-admin-email-error' : undefined}
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="text-white hover:text-white"
                  disabled={inviting || !orgId || !adminEmail.trim()}
                >
                  {inviting ? 'Enviando…' : 'Enviar convite'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Copy, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createInvite, subscribePendingClientInvitesByOrg, cancelInvite } from '@/services/invites'
import {
  countOrganizationSeats,
  countPendingInvites,
  countPendingInvitesByRole,
} from '@/services/organizations'
import type { Invite, Organization } from '@/types'

interface ClientInviteCardProps {
  orgId: string
  org: Organization | null
  createdBy: string
}

export function ClientInviteCard({ orgId, org, createdBy }: ClientInviteCardProps) {
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [inviting, setInviting] = useState(false)
  const [lastInvite, setLastInvite] = useState<{ id: string; link: string } | null>(null)
  const [pending, setPending] = useState<Invite[]>([])
  const [seatUsage, setSeatUsage] = useState({ members: 0, pending: 0 })

  useEffect(() => {
    let cancelled = false
    const loadSeats = async () => {
      try {
        const members = await countOrganizationSeats(orgId)
        let pendingCount: number
        try {
          pendingCount = await countPendingInvites(orgId)
        } catch {
          pendingCount = await countPendingInvitesByRole(orgId, 'client')
        }
        if (!cancelled) setSeatUsage({ members, pending: pendingCount })
      } catch (error) {
        console.error(error)
      }
    }
    void loadSeats()

    const unsubscribe = subscribePendingClientInvitesByOrg(
      orgId,
      (invites) => {
        setPending(invites)
        void loadSeats()
      },
      (error) => console.error('Não foi possível acompanhar os convites de cliente', error),
    )
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [orgId])

  const atCapacity = org ? seatUsage.members + seatUsage.pending >= org.maxUsers : false

  const handleInvite = async () => {
    if (!email.trim()) return
    setInviting(true)
    try {
      const created = await createInvite({
        email,
        role: 'client',
        createdBy,
        orgId,
        department: department.trim() || undefined,
      })
      setLastInvite({ id: created.id, link: created.link })
      toast.success(
        created.emailSent
          ? `Convite enviado para ${created.email}`
          : 'Convite criado, mas o e-mail não foi enviado — copie o link abaixo',
      )
      setEmail('')
      setDepartment('')
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Não foi possível convidar')
    } finally {
      setInviting(false)
    }
  }

  const handleCancel = async (inviteId: string) => {
    try {
      await cancelInvite(inviteId)
      toast.success('Convite cancelado — vaga liberada')
      if (lastInvite?.id === inviteId) setLastInvite(null)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível cancelar o convite')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="size-5" />
          Convidar cliente
        </CardTitle>
        <CardDescription>
          {org
            ? `${seatUsage.members + seatUsage.pending}/${org.maxUsers} acessos em uso (${seatUsage.members} ativos, ${seatUsage.pending} pendentes).`
            : 'Informe o e-mail e envie o convite.'}{' '}
          O cliente entra nesta empresa e acessa somente Orçamento e Planejamento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void handleInvite()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="client-invite-email">E-mail *</Label>
            <Input
              id="client-invite-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="cliente@empresa.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-invite-department">Setor (opcional)</Label>
            <Input
              id="client-invite-department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              placeholder="Comercial, Eventos..."
            />
          </div>
          <Button type="submit" disabled={inviting || !email.trim() || atCapacity}>
            {inviting ? 'Enviando...' : 'Enviar convite'}
          </Button>
          {atCapacity ? (
            <p className="text-xs text-destructive">
              Limite de acessos atingido. Peça ao Admin Master para aumentar o limite.
            </p>
          ) : null}
          {lastInvite ? (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3" role="status">
              <Label htmlFor="client-invite-link">Link do convite</Label>
              <Input
                id="client-invite-link"
                readOnly
                value={lastInvite.link}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(lastInvite.link)
                  toast.success('Link copiado')
                }}
              >
                <Copy className="size-3.5" />
                Copiar link
              </Button>
            </div>
          ) : null}
        </form>

        {pending.length > 0 ? (
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground">Convites de cliente pendentes</p>
            {pending.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">Cliente · aguardando aceite</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void handleCancel(invite.id)}
                >
                  Cancelar convite
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

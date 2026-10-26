import { useEffect, useState } from 'react'
import { Copy, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createInvite,
  subscribePendingClientInvitesByVisit,
  cancelInvite,
} from '@/services/invites'
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
  /** Convite de cliente só é válido com visita/evento. */
  visitId: string
  visitTitle?: string
}

function whatsappStatusLabel(invite: Invite): string {
  if (invite.status === 'declined') return 'Recusado'
  switch (invite.whatsappSendStatus) {
    case 'sent':
      return 'WhatsApp enviado'
    case 'pending':
      return 'WhatsApp pendente'
    case 'skipped_no_provider':
      return 'WhatsApp não configurado'
    case 'skipped_no_phone':
      return 'Sem telefone'
    case 'error':
      return 'Falha no WhatsApp'
    default:
      return 'Aguardando aceite'
  }
}

export function ClientInviteCard({
  orgId,
  org,
  createdBy,
  visitId,
  visitTitle,
}: ClientInviteCardProps) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState('')
  const [inviting, setInviting] = useState(false)
  const [lastInvite, setLastInvite] = useState<{ id: string; link: string } | null>(null)
  const [pending, setPending] = useState<Invite[]>([])
  const [seatUsage, setSeatUsage] = useState({ members: 0, pending: 0 })

  useEffect(() => {
    if (!orgId || !visitId) return
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

    const unsubscribe = subscribePendingClientInvitesByVisit(
      orgId,
      visitId,
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
  }, [orgId, visitId])

  const atCapacity = org ? seatUsage.members + seatUsage.pending >= org.maxUsers : false

  const handleInvite = async () => {
    if (!email.trim() || !phone.trim() || !visitId) return
    setInviting(true)
    try {
      const created = await createInvite({
        email,
        phone,
        role: 'client',
        createdBy,
        orgId,
        visitId,
        department: department.trim() || undefined,
      })
      setLastInvite({ id: created.id, link: created.link })

      const channels: string[] = []
      if (created.emailSent) channels.push('e-mail')
      if (created.whatsappSent) channels.push('WhatsApp')
      if (channels.length > 0) {
        toast.success(`Convite enviado por ${channels.join(' e ')} para ${created.email}`)
      } else {
        toast.message('Convite criado', {
          description: [
            created.emailError ? `E-mail: ${created.emailError}` : null,
            created.whatsappError
              ? `WhatsApp: ${created.whatsappError}`
              : created.whatsappStatus === 'skipped_no_provider'
                ? 'WhatsApp Meta ainda não configurado — use o link abaixo'
                : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'Copie o link abaixo',
        })
      }
      setEmail('')
      setPhone('')
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
          Convidar cliente deste evento
        </CardTitle>
        <CardDescription>
          {visitTitle
            ? `Enviamos e-mail e WhatsApp. O cliente aceita pelo chat ou cria a conta pelo link e entra em “${visitTitle}”.`
            : 'Enviamos e-mail e WhatsApp. O cliente aceita pelo chat ou cria a conta pelo link e fica vinculado a este evento.'}{' '}
          {org
            ? `${seatUsage.members + seatUsage.pending}/${org.maxUsers} acessos em uso (${seatUsage.members} ativos, ${seatUsage.pending} pendentes).`
            : null}{' '}
          Acesso somente a Orçamento e Planejamento.
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
            <Label htmlFor="client-invite-phone">WhatsApp *</Label>
            <Input
              id="client-invite-phone"
              type="tel"
              required
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="(11) 98765-4321"
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
          <Button
            type="submit"
            disabled={inviting || !email.trim() || !phone.trim() || !visitId || atCapacity}
          >
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
            <p className="text-xs font-medium text-muted-foreground">
              Convites pendentes deste evento
            </p>
            {pending.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Cliente · {whatsappStatusLabel(invite)}
                    {invite.phone ? ` · ${invite.phone}` : ''}
                  </p>
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

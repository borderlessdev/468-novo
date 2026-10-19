import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import {
  ACCOUNT_TYPE_OPTIONS,
  accountTypeLabel,
  type AccountType,
} from '@/lib/accountType'
import { changeUserAccountType } from '@/services/accountType'

interface ChangeAccountTypeControlProps {
  uid: string
  name: string
  orgId?: string
  currentType: AccountType
  onChanged: () => void
}

export function ChangeAccountTypeControl({
  uid,
  name,
  orgId,
  currentType,
  onChanged,
}: ChangeAccountTypeControlProps) {
  const [selected, setSelected] = useState<AccountType>(currentType)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    setSelected(currentType)
  }, [currentType])
  const [saving, setSaving] = useState(false)
  const shown = selected === currentType ? currentType : selected

  const requestChange = () => {
    if (shown === currentType) return
    setConfirmOpen(true)
  }

  const confirmChange = async () => {
    setSaving(true)
    try {
      await changeUserAccountType({
        uid,
        accountType: shown,
        orgId,
      })
      toast.success(`Tipo de ${name} atualizado para ${accountTypeLabel(shown)}.`)
      setConfirmOpen(false)
      onChanged()
    } catch (error) {
      console.error(error)
      const message =
        error instanceof Error && error.message
          ? error.message.replace(/^FirebaseError:\s*/i, '')
          : 'Não foi possível alterar o tipo de usuário.'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={shown}
        onValueChange={(value) => setSelected(value as AccountType)}
      >
        <SelectTrigger className="h-8 w-[220px]" aria-label={`Tipo de ${name}`}>
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
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={shown === currentType || saving}
        onClick={requestChange}
      >
        Alterar tipo
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar tipo de usuário?</DialogTitle>
            <DialogDescription>
              {name} passará de {accountTypeLabel(currentType)} para {accountTypeLabel(shown)}.
              A conta e os demais dados permanecem. Administrador master não fica vinculado
              a uma empresa. Os outros perfis continuam na empresa em que já estão. Se o
              acesso de master mudar, a pessoa precisa atualizar a página ou entrar de novo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setConfirmOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={saving} onClick={() => void confirmChange()}>
              {saving ? 'Salvando...' : 'Confirmar alteração'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

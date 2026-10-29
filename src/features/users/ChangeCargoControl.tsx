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
  CARGO_REGION_OPTIONS,
  EMPLOYEE_CARGO_OPTIONS,
  formatMemberCargo,
} from '@/lib/cargo'
import { changeEmployeeCargo } from '@/services/employeeCargo'
import type { CargoRegion, EmployeeCargo } from '@/types'

interface ChangeCargoControlProps {
  uid: string
  name: string
  orgId: string
  currentCargo?: EmployeeCargo
  currentRegion?: CargoRegion
  disabled?: boolean
  onChanged: () => void
}

export function ChangeCargoControl({
  uid,
  name,
  orgId,
  currentCargo,
  currentRegion,
  disabled = false,
  onChanged,
}: ChangeCargoControlProps) {
  const [cargo, setCargo] = useState<EmployeeCargo | ''>(currentCargo ?? '')
  const [region, setRegion] = useState<CargoRegion | ''>(currentRegion ?? '')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCargo(currentCargo ?? '')
    setRegion(currentRegion ?? '')
  }, [currentCargo, currentRegion])

  const dirty =
    cargo !== '' &&
    (cargo !== (currentCargo ?? '') ||
      (cargo === 'analista'
        ? region !== (currentRegion ?? '')
        : Boolean(currentRegion)))

  const requestChange = () => {
    if (!cargo || !dirty) return
    if (cargo === 'analista' && !region) {
      toast.error('Selecione a região do analista.')
      return
    }
    setConfirmOpen(true)
  }

  const confirmChange = async () => {
    if (!cargo) return
    setSaving(true)
    try {
      await changeEmployeeCargo({
        orgId,
        uid,
        cargo,
        cargoRegion: cargo === 'analista' ? (region as CargoRegion) : null,
      })
      toast.success(
        `Cargo de ${name} atualizado para ${formatMemberCargo(
          cargo,
          cargo === 'analista' ? (region as CargoRegion) : null,
        )}.`,
      )
      setConfirmOpen(false)
      onChanged()
    } catch (error) {
      console.error(error)
      const message =
        error instanceof Error && error.message
          ? error.message.replace(/^FirebaseError:\s*/i, '')
          : 'Não foi possível alterar o cargo.'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const nextLabel = formatMemberCargo(
    cargo || undefined,
    cargo === 'analista' ? (region as CargoRegion) || undefined : undefined,
  )
  const currentLabel = formatMemberCargo(currentCargo, currentRegion)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={cargo || undefined}
        onValueChange={(value) => {
          setCargo(value as EmployeeCargo)
          if (value !== 'analista') setRegion('')
        }}
        disabled={disabled || saving}
      >
        <SelectTrigger className="h-8 w-[220px]" aria-label={`Cargo de ${name}`}>
          <SelectValue placeholder="Sem cargo" />
        </SelectTrigger>
        <SelectContent>
          {EMPLOYEE_CARGO_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {cargo === 'analista' ? (
        <Select
          value={region || undefined}
          onValueChange={(value) => setRegion(value as CargoRegion)}
          disabled={disabled || saving}
        >
          <SelectTrigger className="h-8 w-[100px]" aria-label={`Região de ${name}`}>
            <SelectValue placeholder="Região" />
          </SelectTrigger>
          <SelectContent>
            {CARGO_REGION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={
          disabled || saving || !dirty || (cargo === 'analista' && !region)
        }
        onClick={requestChange}
      >
        Alterar cargo
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar cargo?</DialogTitle>
            <DialogDescription>
              {name} passará de {currentLabel} para {nextLabel}. O tipo de conta e as
              permissões da empresa não mudam — só o cargo do organograma.
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
              {saving ? 'Salvando...' : 'Confirmar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

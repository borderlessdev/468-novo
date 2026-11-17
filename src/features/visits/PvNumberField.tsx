import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { normalizePvNumber, pvNumberExists } from '@/lib/pvNumber'

type PvNumberFieldProps = {
  id?: string
  value: string
  suggestedNext: string
  existingNumbers: string[]
  error?: string
  onChange: (value: string) => void
  /** Chamado quando o usuário confirma reutilizar um número já existente. */
  onDuplicateConfirmed?: (pvNumber: string) => void
}

export function PvNumberField({
  id = 'pvNumber',
  value,
  suggestedNext,
  existingNumbers,
  error,
  onChange,
  onDuplicateConfirmed,
}: PvNumberFieldProps) {
  const [open, setOpen] = useState(false)
  const [pendingExisting, setPendingExisting] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return existingNumbers
    return existingNumbers.filter((pv) => pv.toLowerCase().includes(term))
  }, [existingNumbers, filter])

  const normalizedValue = normalizePvNumber(value)
  const isNewPvNumber =
    normalizedValue.length > 0 && !pvNumberExists(normalizedValue, existingNumbers)

  const askIfExisting = (candidate: string) => {
    const normalized = normalizePvNumber(candidate)
    if (!normalized) {
      onChange('')
      return
    }
    if (pvNumberExists(normalized, existingNumbers)) {
      setPendingExisting(normalized)
      return
    }
    onChange(normalized)
  }

  const confirmDuplicate = () => {
    if (!pendingExisting) return
    onChange(pendingExisting)
    onDuplicateConfirmed?.(pendingExisting)
    setPendingExisting(null)
    setOpen(false)
  }

  const confirmNewNumber = () => {
    onChange(suggestedNext)
    setPendingExisting(null)
    setOpen(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>Número da PV *</Label>
        {isNewPvNumber ? (
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
            Este número será criado
          </span>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          inputMode="numeric"
          value={value}
          placeholder={suggestedNext ? `Sugestão: ${suggestedNext}` : 'Informe o número da PV'}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            const normalized = normalizePvNumber(value)
            if (!normalized) return
            if (pvNumberExists(normalized, existingNumbers) && normalized !== value.trim()) {
              askIfExisting(normalized)
              return
            }
            if (normalized !== value) onChange(normalized)
          }}
          className="font-mono"
        />
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (next) setFilter(value)
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 px-3"
              aria-label="Ver PVs existentes"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2">
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filtrar PVs..."
              className="mb-2 h-8"
            />
            <div className="max-h-56 overflow-y-auto">
              <button
                type="button"
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                  'hover:bg-muted',
                )}
                onClick={() => {
                  onChange(suggestedNext)
                  setOpen(false)
                }}
              >
                <span className="font-mono font-medium">{suggestedNext}</span>
                <span className="text-xs text-muted-foreground">Próximo livre</span>
              </button>
              {filtered.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  Nenhuma PV cadastrada ainda.
                </p>
              ) : (
                filtered.map((pv) => (
                  <button
                    key={pv}
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                      'hover:bg-muted',
                      value === pv && 'bg-muted',
                    )}
                    onClick={() => askIfExisting(pv)}
                  >
                    <span className="font-mono">{pv}</span>
                    <span className="text-xs text-muted-foreground">Já usada</span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <p className="text-xs text-muted-foreground">
        Sugestão automática do próximo número. Ao escolher uma PV já existente, você decide se
        duplica o número ou gera um novo.
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <Dialog
        open={pendingExisting != null}
        onOpenChange={(next) => {
          if (!next) setPendingExisting(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>PV {pendingExisting} já existe</DialogTitle>
            <DialogDescription>
              Há visitas em um ou mais estados com este número. Deseja criar com um número novo
              ou duplicar o mesmo número de PV?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button type="button" onClick={confirmNewNumber} className="w-full">
              Usar número novo ({suggestedNext})
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={confirmDuplicate}
              className="w-full"
            >
              Duplicar o número {pendingExisting}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Confirmação usada no submit quando o usuário digitou uma PV já existente. */
export function PvDuplicateSubmitDialog({
  open,
  existingPv,
  suggestedNext,
  onOpenChange,
  onUseNew,
  onDuplicate,
}: {
  open: boolean
  existingPv: string
  suggestedNext: string
  onOpenChange: (open: boolean) => void
  onUseNew: () => void
  onDuplicate: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>PV {existingPv} já existe</DialogTitle>
          <DialogDescription>
            Ao criar a visita, deseja gerar um número de PV novo ou duplicar este número (visitas
            em vários estados podem compartilhar a mesma PV)?
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={onUseNew} className="w-full">
            Usar número novo ({suggestedNext})
          </Button>
          <Button type="button" variant="outline" onClick={onDuplicate} className="w-full">
            Duplicar o número {existingPv}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

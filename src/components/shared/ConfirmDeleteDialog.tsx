import { useCallback, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConfirmDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  itemName?: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title = 'Tem certeza que deseja excluir?',
  description,
  itemName,
  confirmLabel = 'Excluir',
  loading = false,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const message =
    description ??
    (itemName
      ? `O item "${itemName}" será movido para a lixeira e poderá ser restaurado em até 30 dias.`
      : 'Este item será movido para a lixeira e poderá ser restaurado em até 30 dias.')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={loading}
            onClick={() => void onConfirm()}
          >
            {loading ? 'Excluindo...' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface ConfirmDeleteTarget {
  id: string
  name?: string
  title?: string
}

export function useConfirmDelete<T extends ConfirmDeleteTarget>() {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)

  const requestDelete = useCallback((item: T) => {
    setTarget(item)
    setOpen(true)
  }, [])

  const close = useCallback(() => {
    if (loading) return
    setOpen(false)
    setTarget(null)
  }, [loading])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) close()
      else setOpen(true)
    },
    [close],
  )

  const confirm = useCallback(
    async (onConfirm: (item: T) => void | Promise<void>) => {
      if (!target) return
      setLoading(true)
      try {
        await onConfirm(target)
        setOpen(false)
        setTarget(null)
      } finally {
        setLoading(false)
      }
    },
    [target],
  )

  return {
    open,
    target,
    loading,
    requestDelete,
    close,
    handleOpenChange,
    confirm,
  }
}

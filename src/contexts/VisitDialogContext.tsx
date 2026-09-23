import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { VisitEventKind } from '@/types'

interface VisitDialogContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  defaultEventKind?: VisitEventKind
  openNew: (kind?: VisitEventKind) => void
}

const VisitDialogContext = createContext<VisitDialogContextValue | undefined>(undefined)

export function VisitDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false)
  const [defaultEventKind, setDefaultEventKind] = useState<VisitEventKind | undefined>()

  const setOpen = useCallback((next: boolean) => {
    if (!next) setDefaultEventKind(undefined)
    setOpenState(next)
  }, [])

  const openNew = useCallback((kind?: VisitEventKind) => {
    setDefaultEventKind(kind)
    setOpenState(true)
  }, [])

  const value = useMemo(
    () => ({ open, setOpen, defaultEventKind, openNew }),
    [open, setOpen, defaultEventKind, openNew],
  )
  return (
    <VisitDialogContext.Provider value={value}>{children}</VisitDialogContext.Provider>
  )
}

export function useVisitDialog() {
  const context = useContext(VisitDialogContext)
  if (!context) {
    throw new Error('useVisitDialog deve ser usado dentro de VisitDialogProvider')
  }
  return context
}

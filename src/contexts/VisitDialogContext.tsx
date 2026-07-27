import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

interface VisitDialogContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const VisitDialogContext = createContext<VisitDialogContextValue | undefined>(undefined)

export function VisitDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const value = useMemo(() => ({ open, setOpen }), [open])
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

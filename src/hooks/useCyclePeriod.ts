import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getCurrentCycle } from '@/lib/constants'
import { formatDate } from '@/lib/utils'

const STORAGE_KEY = 'cycle-period'

type StoredCycle = {
  startIso: string
  endIso: string
}

function readStoredCycle(): StoredCycle | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredCycle>
    if (parsed.startIso && parsed.endIso) {
      return { startIso: parsed.startIso, endIso: parsed.endIso }
    }
  } catch {
    /* ignore invalid storage */
  }
  return null
}

function writeStoredCycle(startIso: string, endIso: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ startIso, endIso }))
}

export function formatCycleLabel(startIso: string, endIso: string) {
  return `${formatDate(startIso)} a ${formatDate(endIso)}`
}

export function normalizeCycleRange(startIso: string, endIso: string): StoredCycle {
  return startIso <= endIso
    ? { startIso, endIso }
    : { startIso: endIso, endIso: startIso }
}

export function useCyclePeriod(options?: { notify?: boolean }) {
  const defaultCycle = useMemo(() => getCurrentCycle(), [])
  const stored = useMemo(() => readStoredCycle(), [])
  const [cycleStart, setCycleStartState] = useState(
    () => stored?.startIso ?? defaultCycle.startIso,
  )
  const [cycleEnd, setCycleEndState] = useState(() => stored?.endIso ?? defaultCycle.endIso)

  const notifyChange = useCallback(
    (startIso: string, endIso: string) => {
      if (options?.notify) {
        toast.success(`Ciclo atualizado: ${formatCycleLabel(startIso, endIso)}`)
      }
    },
    [options?.notify],
  )

  const setCycleStart = useCallback(
    (value: string) => {
      if (!value) return
      setCycleStartState(value)
      writeStoredCycle(value, cycleEnd)
      notifyChange(value, cycleEnd)
    },
    [cycleEnd, notifyChange],
  )

  const setCycleEnd = useCallback(
    (value: string) => {
      if (!value) return
      setCycleEndState(value)
      writeStoredCycle(cycleStart, value)
      notifyChange(cycleStart, value)
    },
    [cycleStart, notifyChange],
  )

  const resetCycle = useCallback(() => {
    setCycleStartState(defaultCycle.startIso)
    setCycleEndState(defaultCycle.endIso)
    localStorage.removeItem(STORAGE_KEY)
    if (options?.notify) {
      toast.success(`Ciclo resetado: ${formatCycleLabel(defaultCycle.startIso, defaultCycle.endIso)}`)
    }
  }, [defaultCycle.endIso, defaultCycle.startIso, options?.notify])

  const cycleLabel = formatCycleLabel(cycleStart, cycleEnd)
  const isDefaultCycle =
    cycleStart === defaultCycle.startIso && cycleEnd === defaultCycle.endIso
  const range = normalizeCycleRange(cycleStart, cycleEnd)

  return {
    cycleStart,
    cycleEnd,
    cycleLabel,
    isDefaultCycle,
    range,
    setCycleStart,
    setCycleEnd,
    resetCycle,
  }
}

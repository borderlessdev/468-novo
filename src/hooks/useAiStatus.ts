import { useEffect, useState } from 'react'
import { getAiStatus, type AiProviderLabel } from '@/services/ai'

export interface AiStatus {
  provider: AiProviderLabel
  configured: boolean
  model: string | null
}

export function useAiStatus() {
  const [status, setStatus] = useState<AiStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    void getAiStatus()
      .then((data) => {
        if (!cancelled) setStatus(data)
      })
      .catch(() => {
        if (!cancelled) setStatus({ provider: 'mock', configured: false, model: null })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return status
}

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type SafeLogoProps = {
  src?: string | null
  /** Used only if `src` fails to load. */
  fallbackSrc?: string | null
  alt?: string
  className?: string
}

/**
 * Renders a logo image only when a src is available and loads successfully.
 * On missing src or load error, renders nothing (no broken-image icon / alt flash).
 */
export function SafeLogo({
  src,
  fallbackSrc,
  alt = '',
  className,
}: SafeLogoProps) {
  const resolved = src?.trim() || fallbackSrc?.trim() || ''
  const [current, setCurrent] = useState(resolved)
  const [hidden, setHidden] = useState(!resolved)

  useEffect(() => {
    const next = src?.trim() || fallbackSrc?.trim() || ''
    setCurrent(next)
    setHidden(!next)
  }, [src, fallbackSrc])

  if (hidden || !current) return null

  return (
    <img
      src={current}
      alt={alt}
      className={cn(className)}
      onError={() => {
        const next = fallbackSrc?.trim()
        if (next && next !== current) {
          setCurrent(next)
          return
        }
        setHidden(true)
      }}
    />
  )
}

import { Compass } from 'lucide-react'
import type { ReactNode } from 'react'

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(15,47,42,0.12),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(212,160,23,0.12),_transparent_40%)]" />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-[#D4A017]">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Promover Experience</p>
            <p className="text-xs text-muted-foreground">Gestão de visitas corporativas</p>
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

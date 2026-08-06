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
    <div className="relative flex min-h-dvh overflow-hidden bg-background">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_10%_0%,_rgba(15,47,42,0.14),_transparent_55%),radial-gradient(ellipse_50%_40%_at_95%_85%,_rgba(212,160,23,0.14),_transparent_50%)]" />
        <div
          className="absolute inset-0 opacity-[0.035] dark:opacity-[0.05]"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%230f2f2a\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
          }}
        />
      </div>

      {/* Brand panel — desktop */}
      <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-primary px-3 py-10 text-primary-foreground lg:flex xl:w-[46%]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
          <div className="absolute right-0 bottom-0 h-80 w-80 rounded-full bg-brand/15 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(160deg,transparent_40%,rgba(212,160,23,0.08)_100%)]" />
        </div>

        <div className="relative">
          <img
            src="/logo.png"
            alt="Promover Experience"
            className="h-12 w-auto max-w-[240px] object-contain object-left mix-blend-lighten"
          />
          <p className="mt-2 text-xs text-white/60">Operações de visitas corporativas</p>
        </div>

        <div className="relative max-w-md animate-fade-in-up">
          <p className="mb-3 text-xs font-medium tracking-[0.18em] text-brand uppercase">
            Gestão integrada
          </p>
          <h2 className="font-display text-3xl leading-tight font-semibold text-white xl:text-4xl">
            Planeje, acompanhe e entregue cada visita com clareza.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/65">
            Agenda, planejamento, visitantes e financeiro em um só lugar — pensado para a
            operação do dia a dia.
          </p>
        </div>

        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} Promover Experience</p>
      </aside>

      {/* Form panel */}
      <div className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md animate-fade-in-up">
          {/* Mobile brand mark — top left */}
          <div className="mb-8 lg:hidden">
            <div className="inline-flex rounded-xl bg-[#0a0a0a] px-3 py-2.5">
              <img
                src="/logo.png"
                alt="Promover Experience"
                className="h-9 w-auto max-w-[180px] object-contain object-left"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Gestão de visitas corporativas</p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card/95 p-7 shadow-[0_8px_30px_rgba(15,47,42,0.06)] backdrop-blur-sm sm:p-8 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

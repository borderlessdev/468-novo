import { CalendarDays, ChevronDown } from 'lucide-react'
import { CyclePeriodFields } from '@/components/shared/CyclePeriodFields'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDate } from '@/lib/utils'

type Props = {
  cycleStart: string
  cycleEnd: string
  isDefaultCycle: boolean
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  onReset: () => void
}

/** Seletor compacto "Ciclo: dd/mm/aaaa – dd/mm/aaaa" com os campos de período num popover. */
export function ValeCycleSelect({
  cycleStart,
  cycleEnd,
  isDefaultCycle,
  onStartChange,
  onEndChange,
  onReset,
}: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-[0_1px_2px_rgba(15,47,42,0.04)] outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CalendarDays className="h-4 w-4 text-[#005F5B]" aria-hidden />
          <span>
            Ciclo: {formatDate(cycleStart)} – {formatDate(cycleEnd)}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <CyclePeriodFields
          idPrefix="vale-cycle"
          cycleStart={cycleStart}
          cycleEnd={cycleEnd}
          isDefaultCycle={isDefaultCycle}
          onStartChange={onStartChange}
          onEndChange={onEndChange}
          onReset={onReset}
        />
      </PopoverContent>
    </Popover>
  )
}

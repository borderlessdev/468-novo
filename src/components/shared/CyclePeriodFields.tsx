import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface CyclePeriodFieldsProps {
  cycleStart: string
  cycleEnd: string
  isDefaultCycle: boolean
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  onReset: () => void
  idPrefix?: string
  showReset?: boolean
  className?: string
}

export function CyclePeriodFields({
  cycleStart,
  cycleEnd,
  isDefaultCycle,
  onStartChange,
  onEndChange,
  onReset,
  idPrefix = 'cycle',
  showReset = true,
  className,
}: CyclePeriodFieldsProps) {
  return (
    <div className={cn('flex w-full flex-col items-stretch gap-2', className)}>
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-[0_1px_2px_rgba(15,47,42,0.03)] sm:flex-row sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-start`} className="text-xs text-muted-foreground">
            Início do ciclo
          </Label>
          <Input
            id={`${idPrefix}-start`}
            type="date"
            value={cycleStart}
            max={cycleEnd || undefined}
            onChange={(event) => onStartChange(event.target.value)}
            className="w-full sm:w-44"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-end`} className="text-xs text-muted-foreground">
            Fim do ciclo
          </Label>
          <Input
            id={`${idPrefix}-end`}
            type="date"
            value={cycleEnd}
            min={cycleStart || undefined}
            onChange={(event) => onEndChange(event.target.value)}
            className="w-full sm:w-44"
          />
        </div>
      </div>
      {showReset ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto justify-end px-0 text-muted-foreground"
          onClick={onReset}
          disabled={isDefaultCycle}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Resetar ciclo
        </Button>
      ) : null}
    </div>
  )
}

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  VISIT_EVENT_KINDS,
  VISIT_EVENT_SCOPES,
  VISIT_VIP_SUBTYPES,
  visitEventKindLabel,
  visitEventScopeLabel,
  visitVipSubtypeLabel,
} from '@/lib/visitEvent'
import type { VisitEventKind, VisitEventScope, VisitVipSubtype } from '@/types'

type VisitEventFieldsProps = {
  eventKind?: VisitEventKind
  vipSubtype?: VisitVipSubtype
  eventScope?: VisitEventScope
  onEventKindChange: (value: VisitEventKind) => void
  onVipSubtypeChange: (value: VisitVipSubtype | undefined) => void
  onEventScopeChange: (value: VisitEventScope | undefined) => void
  errors?: {
    eventKind?: { message?: string }
    vipSubtype?: { message?: string }
    eventScope?: { message?: string }
  }
}

export function VisitEventFields({
  eventKind,
  vipSubtype,
  eventScope,
  onEventKindChange,
  onVipSubtypeChange,
  onEventScopeChange,
  errors,
}: VisitEventFieldsProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Tipo de evento *</Label>
        <Select
          value={eventKind ?? '_unset'}
          onValueChange={(value) => {
            if (value === '_unset') return
            const kind = value as VisitEventKind
            onEventKindChange(kind)
            if (kind !== 'visita_vip') onVipSubtypeChange(undefined)
            if (kind !== 'evento') onEventScopeChange(undefined)
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o tipo" />
          </SelectTrigger>
          <SelectContent>
            {VISIT_EVENT_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {visitEventKindLabel(kind)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors?.eventKind?.message ? (
          <p className="text-xs text-destructive">{errors.eventKind.message}</p>
        ) : null}
      </div>

      {eventKind === 'visita_vip' ? (
        <div className="space-y-2">
          <Label>Subtipo VIP *</Label>
          <Select
            value={vipSubtype ?? '_unset'}
            onValueChange={(value) => {
              if (value === '_unset') return
              onVipSubtypeChange(value as VisitVipSubtype)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o subtipo" />
            </SelectTrigger>
            <SelectContent>
              {VISIT_VIP_SUBTYPES.map((subtype) => (
                <SelectItem key={subtype} value={subtype}>
                  {visitVipSubtypeLabel(subtype)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors?.vipSubtype?.message ? (
            <p className="text-xs text-destructive">{errors.vipSubtype.message}</p>
          ) : null}
        </div>
      ) : null}

      {eventKind === 'evento' ? (
        <div className="space-y-2">
          <Label>Escopo do evento *</Label>
          <Select
            value={eventScope ?? '_unset'}
            onValueChange={(value) => {
              if (value === '_unset') return
              onEventScopeChange(value as VisitEventScope)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Interno ou externo" />
            </SelectTrigger>
            <SelectContent>
              {VISIT_EVENT_SCOPES.map((scope) => (
                <SelectItem key={scope} value={scope}>
                  {visitEventScopeLabel(scope)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors?.eventScope?.message ? (
            <p className="text-xs text-destructive">{errors.eventScope.message}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

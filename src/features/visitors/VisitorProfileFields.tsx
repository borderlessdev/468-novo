import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  VISITOR_SEX_OPTIONS,
  t,
  type PortalLocale,
} from '@/features/visitors/visitorFormConfig'
import {
  showComunidadeFields,
  showCompanyRole,
  showVipLogistics,
  type VisitorProfileFormValues,
} from '@/features/visitors/visitorProfileModel'
import type { VisitorFormVariant } from '@/types'
import { formatWeightKgInput } from '@/lib/utils'

interface VisitorProfileFieldsProps {
  values: VisitorProfileFormValues
  onChange: (patch: Partial<VisitorProfileFormValues>) => void
  variant: VisitorFormVariant
  locale?: PortalLocale
  /** Portal mostra aceite LGPD; CRM geralmente não. */
  showLgpd?: boolean
  /** CRM mostra país; portal pode omitir. */
  showCountry?: boolean
  errors?: Partial<Record<'name' | 'document', string>>
}

function YesNoRow({
  label,
  checked,
  onCheckedChange,
  locale,
}: {
  label: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
  locale: PortalLocale
}) {
  return (
    <label className="flex items-center gap-3 text-sm sm:col-span-2">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span>
        {label}{' '}
        <span className="text-muted-foreground">
          ({checked ? t('yes', locale) : t('no', locale)})
        </span>
      </span>
    </label>
  )
}

function FlightBlock({
  title,
  prefix,
  values,
  onChange,
  locale,
}: {
  title: string
  prefix: 'arrival' | 'departure'
  values: VisitorProfileFormValues
  onChange: (patch: Partial<VisitorProfileFormValues>) => void
  locale: PortalLocale
}) {
  const originKey = `${prefix}Origin` as const
  const dateKey = `${prefix}Date` as const
  const airlineKey = `${prefix}Airline` as const
  const numberKey = `${prefix}FlightNumber` as const
  const timeKey = `${prefix}Time` as const

  return (
    <div className="space-y-3 rounded-lg border p-3 sm:col-span-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('flightOrigin', locale)}</Label>
          <Input
            value={values[originKey]}
            onChange={(e) => onChange({ [originKey]: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('flightDate', locale)}</Label>
          <Input
            type="date"
            value={values[dateKey]}
            onChange={(e) => onChange({ [dateKey]: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('flightAirline', locale)}</Label>
          <Input
            value={values[airlineKey]}
            onChange={(e) => onChange({ [airlineKey]: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('flightNumber', locale)}</Label>
          <Input
            value={values[numberKey]}
            onChange={(e) => onChange({ [numberKey]: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('flightTime', locale)}</Label>
          <Input
            type="time"
            value={values[timeKey]}
            onChange={(e) => onChange({ [timeKey]: e.target.value })}
          />
        </div>
      </div>
    </div>
  )
}

export function VisitorProfileFields({
  values,
  onChange,
  variant,
  locale = 'pt',
  showLgpd = false,
  showCountry = true,
  errors,
}: VisitorProfileFieldsProps) {
  const vip = showVipLogistics(variant)
  const comunidade = showComunidadeFields(variant)
  const companyRole = showCompanyRole(variant)
  const documentLabel =
    variant === 'comunidade' ? t('documentComunidade', locale) : t('document', locale)

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label>{t('fullName', locale)} *</Label>
        <Input
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {errors?.name ? (
          <p className="text-xs text-destructive">{errors.name}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>{documentLabel} *</Label>
        <Input
          value={values.document}
          onChange={(e) => onChange({ document: e.target.value })}
        />
        {errors?.document ? (
          <p className="text-xs text-destructive">{errors.document}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>{t('cpf', locale)}</Label>
        <Input
          value={values.cpf}
          onChange={(e) => onChange({ cpf: e.target.value })}
        />
      </div>

      {companyRole ? (
        <>
          <div className="space-y-2">
            <Label>{t('company', locale)}</Label>
            <Input
              value={values.company}
              onChange={(e) => onChange({ company: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('role', locale)}</Label>
            <Input
              value={values.role}
              onChange={(e) => onChange({ role: e.target.value })}
            />
          </div>
        </>
      ) : null}

      {comunidade ? (
        <div className="space-y-2">
          <Label>{t('neighborhood', locale)}</Label>
          <Input
            value={values.neighborhood}
            onChange={(e) => onChange({ neighborhood: e.target.value })}
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>{t('sex', locale)}</Label>
        <Select
          value={values.sex || undefined}
          onValueChange={(value) => onChange({ sex: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {VISITOR_SEX_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label[locale]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{t('birthDate', locale)}</Label>
        <Input
          type="date"
          value={values.birthDate}
          onChange={(e) => onChange({ birthDate: e.target.value })}
        />
      </div>

      {vip ? (
        <div className="space-y-2">
          <Label>{t('nationality', locale)}</Label>
          <Input
            value={values.nationality}
            onChange={(e) => onChange({ nationality: e.target.value })}
          />
        </div>
      ) : null}

      {showCountry && vip ? (
        <div className="space-y-2">
          <Label>{t('country', locale)}</Label>
          <Input
            value={values.country}
            onChange={(e) => onChange({ country: e.target.value })}
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>{t('phone', locale)}</Label>
        <Input
          inputMode="tel"
          value={values.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('email', locale)}</Label>
        <Input
          type="email"
          value={values.email}
          onChange={(e) => onChange({ email: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('emergencyPhone', locale)}</Label>
        <Input
          inputMode="tel"
          value={values.emergencyPhone}
          onChange={(e) => onChange({ emergencyPhone: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('whatsapp', locale)}</Label>
        <Input
          inputMode="tel"
          value={values.whatsapp}
          onChange={(e) => onChange({ whatsapp: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('language', locale)}</Label>
        <Input
          value={values.language}
          onChange={(e) => onChange({ language: e.target.value })}
        />
      </div>

      {vip ? (
        <>
          <div className="space-y-2">
            <Label>{t('weightKg', locale)}</Label>
            <Input
              inputMode="decimal"
              placeholder="0,0"
              value={values.weightKg}
              onChange={(e) =>
                onChange({ weightKg: formatWeightKgInput(e.target.value) })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>{t('shoeSize', locale)}</Label>
            <Input
              type="number"
              value={values.shoeSize}
              onChange={(e) => onChange({ shoeSize: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('shirtSize', locale)}</Label>
            <Input
              value={values.shirtSize}
              onChange={(e) => onChange({ shirtSize: e.target.value })}
            />
          </div>
        </>
      ) : null}

      <YesNoRow
        label={t('dietaryHasRestriction', locale)}
        checked={values.dietaryHasRestriction}
        onCheckedChange={(checked) =>
          onChange({
            dietaryHasRestriction: checked,
            dietaryRestriction: checked ? values.dietaryRestriction : '',
          })
        }
        locale={locale}
      />
      {values.dietaryHasRestriction ? (
        <div className="space-y-2 sm:col-span-2">
          <Label>{t('dietaryNotes', locale)}</Label>
          <Textarea
            rows={2}
            value={values.dietaryRestriction}
            onChange={(e) => onChange({ dietaryRestriction: e.target.value })}
          />
        </div>
      ) : null}

      <YesNoRow
        label={t('mobilityReduced', locale)}
        checked={values.mobilityReduced}
        onCheckedChange={(checked) =>
          onChange({
            mobilityReduced: checked,
            mobilityNotes: checked ? values.mobilityNotes : '',
          })
        }
        locale={locale}
      />
      {values.mobilityReduced ? (
        <div className="space-y-2 sm:col-span-2">
          <Label>{t('mobilityNotes', locale)}</Label>
          <Textarea
            rows={2}
            value={values.mobilityNotes}
            onChange={(e) => onChange({ mobilityNotes: e.target.value })}
          />
        </div>
      ) : null}

      <YesNoRow
        label={t('comorbidity', locale)}
        checked={values.comorbidity}
        onCheckedChange={(checked) =>
          onChange({
            comorbidity: checked,
            comorbidityNotes: checked ? values.comorbidityNotes : '',
          })
        }
        locale={locale}
      />
      {values.comorbidity ? (
        <div className="space-y-2 sm:col-span-2">
          <Label>{t('comorbidityNotes', locale)}</Label>
          <Textarea
            rows={2}
            value={values.comorbidityNotes}
            onChange={(e) => onChange({ comorbidityNotes: e.target.value })}
          />
        </div>
      ) : null}

      <YesNoRow
        label={t('specialAttention', locale)}
        checked={values.specialAttention}
        onCheckedChange={(checked) =>
          onChange({
            specialAttention: checked,
            specialAttentionNotes: checked ? values.specialAttentionNotes : '',
          })
        }
        locale={locale}
      />
      {values.specialAttention ? (
        <div className="space-y-2 sm:col-span-2">
          <Label>{t('specialAttentionNotes', locale)}</Label>
          <Textarea
            rows={2}
            value={values.specialAttentionNotes}
            onChange={(e) => onChange({ specialAttentionNotes: e.target.value })}
          />
        </div>
      ) : null}

      {vip ? (
        <>
          <YesNoRow
            label={t('fliesByAir', locale)}
            checked={values.fliesByAir}
            onCheckedChange={(checked) =>
              onChange({
                fliesByAir: checked,
                hasFlightData: checked ? values.hasFlightData : false,
              })
            }
            locale={locale}
          />
          {values.fliesByAir ? (
            <YesNoRow
              label={t('hasFlightData', locale)}
              checked={values.hasFlightData}
              onCheckedChange={(checked) => onChange({ hasFlightData: checked })}
              locale={locale}
            />
          ) : null}
          {values.fliesByAir && values.hasFlightData ? (
            <>
              <FlightBlock
                title={t('arrivalFlight', locale)}
                prefix="arrival"
                values={values}
                onChange={onChange}
                locale={locale}
              />
              <FlightBlock
                title={t('departureFlight', locale)}
                prefix="departure"
                values={values}
                onChange={onChange}
                locale={locale}
              />
            </>
          ) : null}
          <div className="space-y-2 sm:col-span-2">
            <Label>{t('hotelName', locale)}</Label>
            <Input
              value={values.hotelName}
              onChange={(e) => onChange({ hotelName: e.target.value })}
            />
          </div>
        </>
      ) : null}

      <div className="space-y-2 sm:col-span-2">
        <Label>{t('notes', locale)}</Label>
        <Textarea
          rows={3}
          value={values.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </div>

      {showLgpd ? (
        <label className="flex items-start gap-3 text-sm leading-snug sm:col-span-2">
          <Checkbox
            className="mt-0.5"
            checked={values.lgpdConsent}
            onCheckedChange={(checked) =>
              onChange({ lgpdConsent: checked === true })
            }
          />
          <span>
            <span className="font-medium">{t('lgpdLabel', locale)}:</span>{' '}
            {t('lgpdBody', locale)}
          </span>
        </label>
      ) : null}
    </div>
  )
}

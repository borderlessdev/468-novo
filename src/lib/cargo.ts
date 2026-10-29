import type { CargoRegion, EmployeeCargo } from '@/types'

export const EMPLOYEE_CARGOS: readonly EmployeeCargo[] = [
  'ceo',
  'gestao_eventos',
  'gestao_midias',
  'criativos',
  'gestao_pessoas',
  'coordenadora_visitas',
  'co_coordenadora_visitas',
  'adm',
  'nact',
  'finan',
  'analista',
] as const

export const CARGO_REGIONS: readonly CargoRegion[] = ['ma_pa', 'mg', 'rs'] as const

export const EMPLOYEE_CARGO_OPTIONS: { value: EmployeeCargo; label: string }[] = [
  { value: 'ceo', label: 'CEO' },
  { value: 'gestao_eventos', label: 'Gestão de Eventos' },
  { value: 'gestao_midias', label: 'Gestão de Mídias' },
  { value: 'criativos', label: 'Criativos' },
  { value: 'gestao_pessoas', label: 'Gestão de Pessoas' },
  { value: 'coordenadora_visitas', label: 'Coordenadora Programa de Visitas' },
  { value: 'co_coordenadora_visitas', label: 'Co-coordenadora Programa de Visitas' },
  { value: 'adm', label: 'ADM' },
  { value: 'nact', label: 'NACT' },
  { value: 'finan', label: 'FINAN' },
  { value: 'analista', label: 'Analista' },
]

export const CARGO_REGION_OPTIONS: { value: CargoRegion; label: string }[] = [
  { value: 'ma_pa', label: 'MA/PA' },
  { value: 'mg', label: 'MG' },
  { value: 'rs', label: 'RS' },
]

export function isEmployeeCargo(value: unknown): value is EmployeeCargo {
  return typeof value === 'string' && (EMPLOYEE_CARGOS as readonly string[]).includes(value)
}

export function isCargoRegion(value: unknown): value is CargoRegion {
  return typeof value === 'string' && (CARGO_REGIONS as readonly string[]).includes(value)
}

export function cargoLabel(cargo: EmployeeCargo | undefined | null): string {
  if (!cargo) return 'Sem cargo'
  return EMPLOYEE_CARGO_OPTIONS.find((option) => option.value === cargo)?.label ?? cargo
}

export function cargoRegionLabel(region: CargoRegion | undefined | null): string {
  if (!region) return ''
  return CARGO_REGION_OPTIONS.find((option) => option.value === region)?.label ?? region
}

/** Ex.: "Analista · MG" ou "FINAN". */
export function formatMemberCargo(
  cargo: EmployeeCargo | undefined | null,
  region?: CargoRegion | null,
): string {
  const label = cargoLabel(cargo)
  if (!cargo) return label
  if (cargo === 'analista' && region) {
    return `${label} · ${cargoRegionLabel(region)}`
  }
  return label
}

export function normalizeCargoInput(
  cargo: unknown,
  region: unknown,
): { cargo: EmployeeCargo; cargoRegion: CargoRegion | null } | { error: string } {
  if (!isEmployeeCargo(cargo)) {
    return { error: 'Cargo inválido.' }
  }
  if (cargo === 'analista') {
    if (!isCargoRegion(region)) {
      return { error: 'Selecione a região do analista (MA/PA, MG ou RS).' }
    }
    return { cargo, cargoRegion: region }
  }
  return { cargo, cargoRegion: null }
}

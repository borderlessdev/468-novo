export const EMPLOYEE_CARGOS = [
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

export type EmployeeCargo = (typeof EMPLOYEE_CARGOS)[number]

export const CARGO_REGIONS = ['ma_pa', 'mg', 'rs'] as const

export type CargoRegion = (typeof CARGO_REGIONS)[number]

export function isEmployeeCargo(value: unknown): value is EmployeeCargo {
  return typeof value === 'string' && (EMPLOYEE_CARGOS as readonly string[]).includes(value)
}

export function isCargoRegion(value: unknown): value is CargoRegion {
  return typeof value === 'string' && (CARGO_REGIONS as readonly string[]).includes(value)
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

/** Lê cargo de um documento de convite/membro (valores legados ignorados). */
export function readCargoFields(data: {
  cargo?: unknown
  cargoRegion?: unknown
}): { cargo: EmployeeCargo | null; cargoRegion: CargoRegion | null } {
  const cargo = isEmployeeCargo(data.cargo) ? data.cargo : null
  if (!cargo) return { cargo: null, cargoRegion: null }
  if (cargo === 'analista' && isCargoRegion(data.cargoRegion)) {
    return { cargo, cargoRegion: data.cargoRegion }
  }
  return { cargo, cargoRegion: null }
}

import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import type { CargoRegion, EmployeeCargo } from '@/types'

const callChangeEmployeeCargo = httpsCallable<
  { orgId: string; uid: string; cargo: EmployeeCargo; cargoRegion?: CargoRegion | null },
  { unchanged: boolean; cargo: EmployeeCargo; cargoRegion: CargoRegion | null }
>(functions, 'changeEmployeeCargo')

export async function changeEmployeeCargo(input: {
  orgId: string
  uid: string
  cargo: EmployeeCargo
  cargoRegion?: CargoRegion | null
}): Promise<{ unchanged: boolean; cargo: EmployeeCargo; cargoRegion: CargoRegion | null }> {
  const result = await callChangeEmployeeCargo({
    orgId: input.orgId,
    uid: input.uid,
    cargo: input.cargo,
    cargoRegion: input.cargoRegion ?? null,
  })
  return result.data
}

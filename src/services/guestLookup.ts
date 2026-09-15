import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import { draftToProfileForm, type VisitorProfileFormValues } from '@/features/visitors/visitorProfileModel'
import type { GuestVisitorDraft } from '@/types'

export interface GuestLookupVisitorResult {
  found: boolean
  visitor?: GuestVisitorDraft & { name: string }
}

const callLookup = httpsCallable<
  { token: string; fullName: string },
  GuestLookupVisitorResult
>(functions, 'guestLookupVisitorByName')

export async function guestLookupVisitorByName(
  token: string,
  fullName: string,
): Promise<GuestLookupVisitorResult> {
  const result = await callLookup({ token, fullName })
  return result.data
}

/** Converte o subset retornado pela Function em valores de formulário. */
export function lookupResultToProfileForm(
  result: GuestLookupVisitorResult,
  fallbackName: string,
): VisitorProfileFormValues | null {
  if (!result.found || !result.visitor) return null
  return draftToProfileForm(result.visitor, {
    name: result.visitor.name || fallbackName,
    company: result.visitor.company,
  })
}

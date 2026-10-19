import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import type { AccountType } from '@/lib/accountType'

const callChangeUserAccountType = httpsCallable<
  { uid: string; accountType: AccountType; orgId?: string },
  { accountType: AccountType; claimsChanged: boolean }
>(functions, 'changeUserAccountType')

export async function changeUserAccountType(input: {
  uid: string
  accountType: AccountType
  orgId?: string
}): Promise<{ accountType: AccountType; claimsChanged: boolean }> {
  const result = await callChangeUserAccountType(input)
  return result.data
}

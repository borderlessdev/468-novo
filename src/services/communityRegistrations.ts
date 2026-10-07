import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import type { GuestVisitorDraft } from '@/types'

export type CommunityAvailability = { date: string; capacity: number; occupied: number }

const availability = httpsCallable<{ token: string }, { dates: CommunityAvailability[] }>(
  functions,
  'getCommunityRegistrationAvailability',
)
const submit = httpsCallable<
  { token: string; registrationDate: string; draft: GuestVisitorDraft },
  { registrationLinkId: string; alreadyRegistered: boolean }
>(functions, 'submitCommunityRegistration')
const review = httpsCallable<
  { linkId: string; decision: 'approve' | 'reject' },
  { status: string }
>(functions, 'reviewCommunityRegistration')
const confirmation = httpsCallable<
  { token: string },
  { visitorName: string; visitTitle: string; registrationDate: string; status: string }
>(functions, 'getCommunityConfirmation')
const confirm = httpsCallable<{ token: string }, { status: string; alreadyConfirmed: boolean }>(
  functions,
  'confirmCommunityPresence',
)
const sendWhatsApp = httpsCallable<{ linkId: string }, { status: string }>(
  functions,
  'sendCommunityConfirmationWhatsApp',
)

export async function getCommunityAvailability(token: string) {
  return (await availability({ token })).data.dates
}

export async function submitCommunityRegistration(input: {
  token: string
  registrationDate: string
  draft: GuestVisitorDraft
}) {
  return (await submit(input)).data
}

export async function reviewCommunityRegistration(linkId: string, decision: 'approve' | 'reject') {
  return (await review({ linkId, decision })).data
}

export async function getCommunityConfirmation(token: string) {
  return (await confirmation({ token })).data
}

export async function confirmCommunityPresence(token: string) {
  return (await confirm({ token })).data
}

export async function sendCommunityConfirmationWhatsApp(linkId: string) {
  return (await sendWhatsApp({ linkId })).data
}

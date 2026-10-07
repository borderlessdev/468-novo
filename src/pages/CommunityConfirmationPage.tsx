import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SafeLogo } from '@/components/SafeLogo'
import { formatDate } from '@/lib/utils'
import {
  confirmCommunityPresence,
  getCommunityConfirmation,
} from '@/services/communityRegistrations'

type State = 'loading' | 'ready' | 'confirmed' | 'error'

export function CommunityConfirmationPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [state, setState] = useState<State>('loading')
  const [data, setData] = useState<{
    visitorName: string
    visitTitle: string
    registrationDate: string
    status: string
  } | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await getCommunityConfirmation(token)
        setData(loaded)
        setState(loaded.status === 'confirmed' ? 'confirmed' : 'ready')
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Link de confirmação indisponível.')
        setState('error')
      }
    })()
  }, [token])

  const handleConfirm = async () => {
    try {
      await confirmCommunityPresence(token)
      setState('confirmed')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível confirmar a presença.')
      setState('error')
    }
  }

  return (
    <main className="vale-portal-shell flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <SafeLogo src="/vale-logo.svg" alt="Vale" className="h-12 w-auto max-w-40 object-contain" />
          <CardTitle>Confirmação de presença</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-center">
          {state === 'loading' ? <p className="text-sm text-muted-foreground">Carregando confirmação…</p> : null}
          {state === 'error' ? <p className="text-sm text-destructive">{message}</p> : null}
          {data && state !== 'error' ? (
            <>
              <div className="space-y-1">
                <p className="font-semibold">{data.visitorName}</p>
                <p className="text-sm text-muted-foreground">{data.visitTitle}</p>
                <p className="text-sm text-muted-foreground">{formatDate(data.registrationDate)}</p>
              </div>
              {state === 'confirmed' ? (
                <div className="space-y-2 text-success">
                  <CheckCircle2 className="mx-auto h-10 w-10" />
                  <p className="font-medium">Presença confirmada. Obrigado!</p>
                </div>
              ) : (
                <Button className="w-full" onClick={() => void handleConfirm()}>
                  Confirmar presença
                </Button>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}

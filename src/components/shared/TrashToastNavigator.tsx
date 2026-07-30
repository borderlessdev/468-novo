import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { setTrashNavigation, TRASH_PATH } from '@/lib/toast'

export function TrashToastNavigator() {
  const navigate = useNavigate()

  useEffect(() => {
    setTrashNavigation(() => navigate(TRASH_PATH))
  }, [navigate])

  return null
}

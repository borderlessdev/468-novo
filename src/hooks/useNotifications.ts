import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotifications,
} from '@/services/notifications'
import type { Notification } from '@/types'

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setNotifications([])
      setLoading(false)
      return
    }

    setLoading(true)
    const unsubscribe = subscribeNotifications(
      userId,
      (items) => {
        setNotifications(items)
        setLoading(false)
      },
      () => {
        setLoading(false)
      },
    )

    return unsubscribe
  }, [userId])

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  )

  const markRead = useCallback(async (id: string) => {
    try {
      await markNotificationRead(id)
    } catch (error) {
      console.warn('Failed to mark notification as read', error)
    }
  }, [])

  const markAllRead = useCallback(async () => {
    if (!userId) return
    try {
      await markAllNotificationsRead(notifications)
    } catch (error) {
      console.warn('Failed to mark all notifications as read', error)
    }
  }, [userId, notifications])

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
  }
}

'use client'

import { useNotificationStore } from '@/store/notificationStore'
import Notification from './Notification'

export default function NotificationContainer() {
  const { notifications, removeNotification } = useNotificationStore()

  return (
    <>
      {notifications.map((notification) => (
        <Notification
          key={notification.id}
          message={notification.message}
          type={notification.type}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </>
  )
}


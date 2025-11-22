import { create } from 'zustand'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

interface Notification {
  id: string
  message: string
  type: NotificationType
  timestamp: number
}

interface NotificationStore {
  notifications: Notification[]
  addNotification: (message: string | unknown[] | object | unknown, type?: NotificationType) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  addNotification: (message, type = 'info') => {
    // Убеждаемся, что message - это строка
    let messageStr = ''
    if (typeof message === 'string') {
      messageStr = message
    } else if (Array.isArray(message)) {
      messageStr = message.map((item: any) => {
        if (typeof item === 'string') return item
        if (item?.msg) return item.msg
        return JSON.stringify(item)
      }).join(', ')
    } else if (message && typeof message === 'object') {
      if (message.msg) {
        messageStr = message.msg
      } else {
        messageStr = JSON.stringify(message)
      }
    } else {
      messageStr = String(message || 'Неизвестная ошибка')
    }
    
    const notification: Notification = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
      message: messageStr,
      type,
      timestamp: Date.now(),
    }
    set((state) => ({
      notifications: [...state.notifications, notification],
    }))
    // Автоматическое удаление через 5 секунд
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== notification.id),
      }))
    }, 5000)
  },
  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))
  },
  clearNotifications: () => {
    set({ notifications: [] })
  },
}))

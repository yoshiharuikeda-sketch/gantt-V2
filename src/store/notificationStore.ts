import { create } from 'zustand'
import type { AppNotification } from '@/types'

interface NotificationStore {
  notifications: AppNotification[]
  setNotifications: (n: AppNotification[]) => void
  markRead: (id: string) => void
  markAllRead: () => void
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

  setNotifications: (notifications) => set({ notifications }),

  markRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      ),
    })),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
    })),
}))

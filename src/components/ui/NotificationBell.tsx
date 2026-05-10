'use client'

import { useEffect } from 'react'
import { Bell } from 'lucide-react'
import { useNotificationStore } from '@/store/notificationStore'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import type { AppNotification } from '@/types'

export function NotificationBell() {
  const { notifications, setNotifications, markRead, markAllRead } =
    useNotificationStore()

  useEffect(() => {
    fetch('/api/notifications')
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.json()
      })
      .then((json: { data?: AppNotification[]; error?: string }) => {
        if (Array.isArray(json.data)) setNotifications(json.data)
      })
      .catch(() => {})
  }, [setNotifications])

  const unreadCount = notifications.filter((n) => !n.is_read).length

  async function handleMarkRead(id: string) {
    const prev = notifications
    markRead(id)
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) setNotifications(prev)
  }

  async function handleMarkAllRead() {
    const prev = notifications
    markAllRead()
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    })
    if (!res.ok) setNotifications(prev)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex items-center justify-center size-8 rounded-full hover:bg-slate-100 text-slate-600 transition-colors outline-none"
        aria-label="通知を開く"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <Badge
            className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 text-[10px] leading-none pointer-events-none"
            variant="default"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side="bottom" className="w-80">
        <DropdownMenuGroup>
          <div className="flex items-center justify-between px-1.5 py-1">
            <DropdownMenuLabel className="px-0 py-0">通知</DropdownMenuLabel>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                すべて既読
              </button>
            )}
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            通知はありません
          </p>
        ) : (
          <DropdownMenuGroup className="max-h-80 overflow-y-auto">
            {notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => {
                  if (!n.is_read) handleMarkRead(n.id)
                }}
                className="flex-col items-start gap-0.5 cursor-pointer"
              >
                <div className="flex w-full items-center gap-2">
                  {!n.is_read && (
                    <span className="size-1.5 shrink-0 rounded-full bg-indigo-500" />
                  )}
                  <span className={`text-sm font-medium ${n.is_read ? 'text-muted-foreground' : ''}`}>
                    {n.title}
                  </span>
                </div>
                {n.body && (
                  <p className="text-xs text-muted-foreground line-clamp-2 pl-3.5">
                    {n.body}
                  </p>
                )}
                <time className="text-[10px] text-muted-foreground/70 pl-3.5">
                  {new Date(n.created_at).toLocaleString('ja-JP', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

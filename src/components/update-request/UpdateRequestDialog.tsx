'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { RequestType } from '@/types/database'

interface UpdateRequestDialogProps {
  taskId: string
  taskName: string
  projectId: string
}

const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  schedule: 'スケジュール変更',
  progress: '進捗更新',
  status: 'ステータス変更',
  general: 'その他',
}

export function UpdateRequestDialog({ taskId, taskName, projectId }: UpdateRequestDialogProps) {
  const [open, setOpen] = useState(false)
  const [requestType, setRequestType] = useState<RequestType>('general')
  const [message, setMessage] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/update-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          project_id: projectId,
          request_type: requestType,
          message: message.trim() || undefined,
          due_date: dueDate || undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? '申請の送信に失敗しました')
      }

      setMessage('')
      setDueDate('')
      setRequestType('general')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">変更申請</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>変更申請: {taskName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="request-type">申請種別</Label>
            <Select
              value={requestType}
              onValueChange={(v) => {
                if (v !== null && Object.keys(REQUEST_TYPE_LABELS).includes(v)) {
                  setRequestType(v as RequestType)
                }
              }}
            >
              <SelectTrigger id="request-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(REQUEST_TYPE_LABELS) as [RequestType, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="request-message">メッセージ（任意）</Label>
            <textarea
              id="request-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="変更内容や理由を入力..."
              rows={4}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="request-due-date">希望期限（任意）</Label>
            <input
              id="request-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '送信中...' : '申請を送信'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

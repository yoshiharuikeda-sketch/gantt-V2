'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { UpdateRequest } from '@/types/database'

interface UpdateRequestListProps {
  projectId: string
}

const STATUS_LABELS: Record<UpdateRequest['status'], string> = {
  pending: '承認待ち',
  submitted: '提出済み',
  approved: '承認済み',
  rejected: '却下',
}

const REQUEST_TYPE_LABELS: Record<UpdateRequest['request_type'], string> = {
  schedule: 'スケジュール変更',
  progress: '進捗更新',
  status: 'ステータス変更',
  general: 'その他',
}

export function UpdateRequestList({ projectId }: UpdateRequestListProps) {
  const [requests, setRequests] = useState<UpdateRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRequests() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/update-requests?projectId=${projectId}`)
        if (!res.ok) {
          const body = await res.json() as { error?: string }
          throw new Error(body.error ?? '申請の取得に失敗しました')
        }
        const body = await res.json() as { data: UpdateRequest[] }
        setRequests(body.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'エラーが発生しました')
      } finally {
        setLoading(false)
      }
    }

    void fetchRequests()
  }, [projectId])

  async function handleApprove(id: string) {
    setActionLoading(id)
    try {
      const res = await fetch('/api/update-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approve' }),
      })
      const json = await res.json() as { error?: string; data?: UpdateRequest }
      if (!res.ok) {
        throw new Error(json.error ?? '承認に失敗しました')
      }
      if (json.data) {
        const updated = json.data
        setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(id: string) {
    setActionLoading(id)
    try {
      const res = await fetch('/api/update-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reject', rejection_reason: rejectionReason.trim() || undefined }),
      })
      const json = await res.json() as { error?: string; data?: UpdateRequest }
      if (!res.ok) {
        throw new Error(json.error ?? '却下に失敗しました')
      }
      if (json.data) {
        const updated = json.data
        setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)))
      }
      setRejectingId(null)
      setRejectionReason('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground p-4">読み込み中...</p>
  }

  if (error) {
    return <p className="text-sm text-destructive p-4">{error}</p>
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">申請はまだありません</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-1">
        {requests.map((request) => (
          <div key={request.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {REQUEST_TYPE_LABELS[request.request_type]}
              </span>
              <span className={[
                'text-xs px-2 py-0.5 rounded-full font-medium',
                request.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                request.status === 'approved' ? 'bg-green-100 text-green-700' :
                request.status === 'rejected' ? 'bg-red-100 text-red-700' :
                'bg-slate-100 text-slate-600',
              ].join(' ')}>
                {STATUS_LABELS[request.status]}
              </span>
            </div>

            {request.message && (
              <p className="text-sm text-muted-foreground">{request.message}</p>
            )}

            {request.due_date && (
              <p className="text-xs text-muted-foreground">希望期限: {request.due_date}</p>
            )}

            {request.rejection_reason && (
              <p className="text-xs text-destructive">却下理由: {request.rejection_reason}</p>
            )}

            <p className="text-xs text-muted-foreground">
              申請日: {new Date(request.created_at).toLocaleDateString('ja-JP')}
            </p>

            {request.status === 'pending' && (
              <div className="space-y-2 pt-1">
                {rejectingId === request.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="却下理由（任意）"
                      rows={2}
                      className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void handleReject(request.id)}
                        disabled={actionLoading === request.id}
                      >
                        {actionLoading === request.id ? '処理中...' : '却下を確定'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setRejectingId(null); setRejectionReason('') }}
                        disabled={actionLoading === request.id}
                      >
                        キャンセル
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => void handleApprove(request.id)}
                      disabled={actionLoading === request.id}
                    >
                      {actionLoading === request.id ? '処理中...' : '承認'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRejectingId(request.id)}
                      disabled={actionLoading === request.id}
                    >
                      却下
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

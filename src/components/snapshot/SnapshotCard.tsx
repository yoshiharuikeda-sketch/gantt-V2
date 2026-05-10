'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils/dateUtils'
import type { Snapshot } from '@/types'

interface SnapshotCardProps {
  snapshot: Snapshot
  isActive: boolean
  onActivate: () => void
  onDelete: () => void
  canDelete: boolean
}

export function SnapshotCard({
  snapshot,
  isActive,
  onActivate,
  onDelete,
  canDelete,
}: SnapshotCardProps) {
  async function handleDelete() {
    const confirmed = window.confirm(`「${snapshot.name}」を削除しますか？この操作は元に戻せません。`)
    if (!confirmed) return

    try {
      const res = await fetch(`/api/snapshots/${snapshot.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        alert(body.error ?? '削除に失敗しました')
        return
      }
      onDelete()
    } catch {
      alert('削除中にエラーが発生しました')
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">{snapshot.name}</p>
          <Badge variant="secondary">
            {snapshot.task_snapshots.length} タスク
          </Badge>
        </div>
        {snapshot.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{snapshot.description}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {formatDateTime(snapshot.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant={isActive ? 'outline' : 'default'}
          size="sm"
          onClick={onActivate}
          className={isActive ? 'border-indigo-500 text-indigo-600' : ''}
        >
          {isActive ? '比較中' : '比較する'}
        </Button>
        {canDelete && !isActive && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
          >
            削除
          </Button>
        )}
      </div>
    </div>
  )
}

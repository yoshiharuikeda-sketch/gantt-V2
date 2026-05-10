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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSnapshotStore } from '@/store/snapshotStore'
import type { Snapshot } from '@/types'

interface CreateSnapshotDialogProps {
  projectId: string
  onCreated: (snapshot: Snapshot) => void
}

export function CreateSnapshotDialog({ projectId, onCreated }: CreateSnapshotDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addSnapshot = useSnapshotStore((s) => s.addSnapshot)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'スナップショットの作成に失敗しました')
      }

      const body = await res.json() as { data: string }
      const snapshotId = body.data

      // 作成されたスナップショットを取得
      const snapshotRes = await fetch(`/api/snapshots?projectId=${projectId}`)
      if (!snapshotRes.ok) {
        throw new Error('スナップショットの取得に失敗しました')
      }
      const snapshotBody = await snapshotRes.json() as { data: Snapshot[] }
      const created = snapshotBody.data.find((s) => s.id === snapshotId)

      if (created) {
        addSnapshot(created)
        onCreated(created)
      }

      setName('')
      setDescription('')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="default" size="sm">版を作成</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>版を作成</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="snapshot-name">版名 *</Label>
            <Input
              id="snapshot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: v1.0 初期計画"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="snapshot-description">説明（任意）</Label>
            <textarea
              id="snapshot-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="この版の説明を入力..."
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 resize-none"
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
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? '作成中...' : '作成'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

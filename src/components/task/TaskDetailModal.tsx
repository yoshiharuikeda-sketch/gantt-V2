'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTaskStore } from '@/store/taskStore'
import { useProjectStore } from '@/store/projectStore'
import type { Task, TaskStatus } from '@/types/database'

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: '未着手',
  in_progress: '進行中',
  completed: '完了',
  blocked: 'ブロック中',
}

const STATUS_OPTIONS: TaskStatus[] = ['not_started', 'in_progress', 'completed', 'blocked']

interface TaskDetailModalProps {
  task: Task
  open: boolean
  onClose: () => void
}

type FormState = {
  name: string
  description: string
  status: TaskStatus
  start_date: string
  end_date: string
  progress: number
  phase_id: string
  assignee_id: string
  vendor_id: string
}

function toFormState(task: Task): FormState {
  return {
    name: task.name,
    description: task.description ?? '',
    status: task.status,
    start_date: task.start_date ?? '',
    end_date: task.end_date ?? '',
    progress: task.progress,
    phase_id: task.phase_id ?? '',
    assignee_id: task.assignee_id ?? '',
    vendor_id: task.vendor_id ?? '',
  }
}

export function TaskDetailModal({ task, open, onClose }: TaskDetailModalProps) {
  const phases = useTaskStore((s) => s.phases)
  const members = useProjectStore((s) => s.members)
  const permissions = useProjectStore((s) => s.permissions)
  const updateTask = useTaskStore((s) => s.updateTask)

  const [form, setForm] = useState<FormState>(() => toFormState(task))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm(toFormState(task))
    setError(null)
  }, [task])

  const canEdit = permissions?.canEdit ?? false
  const isVendor = permissions?.isVendor ?? false

  const vendorRestrictsFields = isVendor && !canEdit

  function isDisabled(field: 'name' | 'description' | 'status' | 'dates' | 'progress' | 'phase_id' | 'assignee_id' | 'vendor_id'): boolean {
    if (!canEdit && !isVendor) return true
    if (vendorRestrictsFields) {
      return field === 'name' || field === 'description' || field === 'phase_id' || field === 'assignee_id' || field === 'vendor_id'
    }
    return false
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const vendorMembers = members.filter((m) => m.role === 'vendor')

  async function handleSave() {
    setLoading(true)
    setError(null)

    const updates: Partial<Task> = {
      name: form.name,
      description: form.description || null,
      status: form.status,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      progress: form.progress,
      phase_id: form.phase_id || null,
      assignee_id: form.assignee_id || null,
      vendor_id: form.vendor_id || null,
    }

    // Optimistic update
    updateTask(task.id, updates)

    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, version: task.version, ...updates }),
      })

      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? '保存に失敗しました')
      }

      const body = await res.json() as { data: Task }
      updateTask(task.id, body.data)
      onClose()
    } catch (err) {
      updateTask(task.id, {
        name: task.name,
        description: task.description,
        status: task.status,
        start_date: task.start_date,
        end_date: task.end_date,
        progress: task.progress,
        phase_id: task.phase_id,
        assignee_id: task.assignee_id,
        vendor_id: task.vendor_id,
      })
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const readOnly = !canEdit && !isVendor

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>タスク詳細</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="task-name">タスク名</Label>
            <Input
              id="task-name"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              disabled={isDisabled('name') || loading}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="task-description">説明</Label>
            <textarea
              id="task-description"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              disabled={isDisabled('description') || loading}
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 resize-none"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>ステータス</Label>
            <Select
              value={form.status}
              onValueChange={(v) => { if (v !== null) setField('status', v as TaskStatus) }}
              disabled={isDisabled('status') || loading}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="task-start">開始日</Label>
              <input
                id="task-start"
                type="date"
                value={form.start_date}
                onChange={(e) => setField('start_date', e.target.value)}
                disabled={isDisabled('dates') || loading}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="task-end">終了日</Label>
              <input
                id="task-end"
                type="date"
                value={form.end_date}
                onChange={(e) => setField('end_date', e.target.value)}
                disabled={isDisabled('dates') || loading}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="task-progress">進捗率（0〜100）</Label>
            <Input
              id="task-progress"
              type="number"
              min={0}
              max={100}
              value={form.progress}
              onChange={(e) => setField('progress', Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
              disabled={isDisabled('progress') || loading}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>フェーズ</Label>
            <Select
              value={form.phase_id}
              onValueChange={(v) => setField('phase_id', v ?? '')}
              disabled={isDisabled('phase_id') || loading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="フェーズなし" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">フェーズなし</SelectItem>
                {phases.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>担当者</Label>
            <Select
              value={form.assignee_id}
              onValueChange={(v) => setField('assignee_id', v ?? '')}
              disabled={isDisabled('assignee_id') || loading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="未設定" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">未設定</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.profiles?.display_name ?? m.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>ベンダー</Label>
            <Select
              value={form.vendor_id}
              onValueChange={(v) => setField('vendor_id', v ?? '')}
              disabled={isDisabled('vendor_id') || loading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="未設定" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">未設定</SelectItem>
                {vendorMembers.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.profiles?.display_name ?? m.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            キャンセル
          </Button>
          {!readOnly && (
            <Button onClick={handleSave} disabled={loading}>
              {loading ? '保存中...' : '保存'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

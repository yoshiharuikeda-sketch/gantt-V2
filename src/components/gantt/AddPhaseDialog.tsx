'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTaskStore } from '@/store/taskStore'
import { useProjectStore } from '@/store/projectStore'
import type { Phase } from '@/types'

export function AddPhaseDialog() {
  const currentProject = useProjectStore((s) => s.currentProject)
  const phases = useTaskStore((s) => s.phases)
  const upsertPhase = useTaskStore((s) => s.upsertPhase)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setName('')
      setError(null)
      setNameError(false)
    }
    setOpen(next)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!name.trim()) {
      setNameError(true)
      return
    }
    if (!currentProject) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/phases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: currentProject.id,
          name: name.trim(),
          display_order: phases.length,
          color: '#6366F1',
          start_date: null,
          end_date: null,
        }),
      })

      if (!res.ok) {
        const json = await res.json() as { error?: string }
        throw new Error(json.error ?? 'フェーズの作成に失敗しました')
      }

      const json = await res.json() as { data: Phase }
      upsertPhase(json.data)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'フェーズの作成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="flex items-center gap-1" />
        }
      >
        <Plus className="size-3.5" />
        フェーズ追加
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>フェーズを追加</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} id="add-phase-form" className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="phase-name">
              フェーズ名
              <span className="text-destructive ml-1" aria-hidden>*</span>
            </Label>
            <Input
              id="phase-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (e.target.value.trim()) setNameError(false)
              }}
              placeholder="例: 設計フェーズ"
              aria-invalid={nameError}
              aria-describedby={nameError ? 'phase-name-error' : undefined}
              disabled={loading}
              autoFocus
            />
            {nameError && (
              <p id="phase-name-error" className="text-xs text-destructive">
                フェーズ名は必須です
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </form>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            キャンセル
          </DialogClose>
          <Button type="submit" form="add-phase-form" disabled={loading}>
            {loading ? '作成中…' : '追加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

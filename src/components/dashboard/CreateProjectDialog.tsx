'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type FormState = {
  name: string
  description: string
  color: string
  client_name: string
  project_number: string
}

const DEFAULT_FORM: FormState = {
  name: '',
  description: '',
  color: '#6366F1',
  client_name: '',
  project_number: '',
}

export function CreateProjectDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState(false)

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (field === 'name' && value.trim()) {
      setNameError(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!form.name.trim()) {
      setNameError(true)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          color: form.color,
          client_name: form.client_name.trim() || undefined,
          project_number: form.project_number.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const json = await res.json() as { error?: string }
        throw new Error(json.error ?? 'プロジェクトの作成に失敗しました')
      }

      setOpen(false)
      setForm(DEFAULT_FORM)
      setNameError(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'プロジェクトの作成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setForm(DEFAULT_FORM)
      setError(null)
      setNameError(false)
    }
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button className="flex items-center gap-2" />
        }
      >
        <Plus className="size-4" />
        新規プロジェクト作成
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新規プロジェクト作成</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} id="create-project-form" className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="project-name">
              プロジェクト名
              <span className="text-destructive ml-1" aria-hidden>*</span>
            </Label>
            <Input
              id="project-name"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="例: ウェブサイトリニューアル"
              aria-invalid={nameError}
              aria-describedby={nameError ? 'name-error' : undefined}
              disabled={loading}
            />
            {nameError && (
              <p id="name-error" className="text-xs text-destructive">
                プロジェクト名は必須です
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="project-description">説明</Label>
            <Input
              id="project-description"
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="プロジェクトの概要（任意）"
              disabled={loading}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="project-color">カラー</Label>
            <div className="flex items-center gap-3">
              <input
                id="project-color"
                type="color"
                value={form.color}
                onChange={(e) => handleChange('color', e.target.value)}
                disabled={loading}
                className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="text-sm text-muted-foreground">{form.color}</span>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="project-client">クライアント名</Label>
            <Input
              id="project-client"
              value={form.client_name}
              onChange={(e) => handleChange('client_name', e.target.value)}
              placeholder="例: 株式会社○○（任意）"
              disabled={loading}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="project-number">プロジェクト番号</Label>
            <Input
              id="project-number"
              value={form.project_number}
              onChange={(e) => handleChange('project_number', e.target.value)}
              placeholder="例: PRJ-001（任意）"
              disabled={loading}
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </form>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />} onClick={() => setOpen(false)}>
            キャンセル
          </DialogClose>
          <Button
            type="submit"
            form="create-project-form"
            disabled={loading}
          >
            {loading ? '作成中…' : '作成'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

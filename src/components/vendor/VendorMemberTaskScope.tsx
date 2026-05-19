'use client'

import { useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { Phase, MemberWithProfile } from '@/types'

interface VendorMemberTaskScopeProps {
  member: MemberWithProfile
  phases: Phase[]
  onScopeChange: (memberId: string, phaseIds: string[]) => Promise<void>
}

export function VendorMemberTaskScope({
  member,
  phases,
  onScopeChange,
}: VendorMemberTaskScopeProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(member.vendor_phase_ids ?? [])
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleToggle(phaseId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(phaseId)) {
        next.delete(phaseId)
      } else {
        next.add(phaseId)
      }
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await onScopeChange(member.id, Array.from(selectedIds))
    } catch (err) {
      console.error('Failed to update vendor phase scope:', err)
      setError('保存に失敗しました。再度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  const memberName =
    member.profiles?.display_name ?? member.profiles?.email ?? member.user_id

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{memberName} の閲覧スコープ</p>
      <ScrollArea className="max-h-60 border rounded-md p-2">
        <div className="space-y-2 p-1">
          {phases.map((phase) => (
            <div key={phase.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`scope-${member.id}-${phase.id}`}
                checked={selectedIds.has(phase.id)}
                onChange={() => handleToggle(phase.id)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor={`scope-${member.id}-${phase.id}`} className="font-normal cursor-pointer">
                {phase.name}
              </Label>
            </div>
          ))}
          {phases.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">フェーズがありません</p>
          )}
        </div>
      </ScrollArea>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? '保存中...' : '保存'}
      </Button>
    </div>
  )
}

'use client'

import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSnapshotStore } from '@/store/snapshotStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useProjectStore } from '@/store/projectStore'
import { CreateSnapshotDialog } from '@/components/snapshot/CreateSnapshotDialog'
import type { Snapshot } from '@/types'

export function BaselineToggle() {
  const snapshots = useSnapshotStore((s) => s.snapshots)
  const activeBaselineId = useSnapshotStore((s) => s.activeBaselineId)
  const setActiveBaseline = useSnapshotStore((s) => s.setActiveBaseline)
  const permissions = usePermissions()
  const currentProject = useProjectStore((s) => s.currentProject)

  const canCreateSnapshot = permissions.canCreateSnapshot

  function handleCreated(_snapshot: Snapshot) {
    // snapshotStore への addSnapshot は CreateSnapshotDialog 内で実施済み
  }

  if (!currentProject) return null

  return (
    <div className="flex items-center gap-2">
      <Select
        value={activeBaselineId ?? ''}
        onValueChange={(v) => setActiveBaseline(v === '' ? null : v)}
      >
        <SelectTrigger size="sm" className="w-44 text-xs">
          <SelectValue placeholder="比較しない" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">比較しない</SelectItem>
          {snapshots.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {canCreateSnapshot && (
        <CreateSnapshotDialog
          projectId={currentProject.id}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}

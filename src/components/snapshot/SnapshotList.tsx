'use client'

import { useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSnapshotStore } from '@/store/snapshotStore'
import { usePermissions } from '@/hooks/usePermissions'
import { CreateSnapshotDialog } from './CreateSnapshotDialog'
import { SnapshotCard } from './SnapshotCard'
import type { Snapshot } from '@/types'

interface SnapshotListProps {
  projectId: string
  initialSnapshots: Snapshot[]
}

export function SnapshotList({ projectId, initialSnapshots }: SnapshotListProps) {
  const setSnapshots = useSnapshotStore((s) => s.setSnapshots)
  const snapshots = useSnapshotStore((s) => s.snapshots)
  const activeBaselineId = useSnapshotStore((s) => s.activeBaselineId)
  const setActiveBaseline = useSnapshotStore((s) => s.setActiveBaseline)
  const removeSnapshot = useSnapshotStore((s) => s.removeSnapshot)
  const permissions = usePermissions()

  useEffect(() => {
    setSnapshots(initialSnapshots)
  }, [initialSnapshots, setSnapshots])

  function handleDelete(snapshotId: string) {
    removeSnapshot(snapshotId)
  }

  return (
    <div className="space-y-4">
      {permissions.canCreateSnapshot && (
        <div className="flex justify-end">
          <CreateSnapshotDialog
            projectId={projectId}
            onCreated={() => {}}
          />
        </div>
      )}

      {snapshots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">版がまだ作成されていません</p>
          {permissions.canCreateSnapshot && (
            <p className="text-xs text-muted-foreground mt-1">
              「版を作成」ボタンから現在の計画を保存できます
            </p>
          )}
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-16rem)]">
          <div className="space-y-2 pr-4">
            {snapshots.map((snapshot) => (
              <SnapshotCard
                key={snapshot.id}
                snapshot={snapshot}
                isActive={activeBaselineId === snapshot.id}
                onActivate={() =>
                  setActiveBaseline(
                    activeBaselineId === snapshot.id ? null : snapshot.id
                  )
                }
                onDelete={() => handleDelete(snapshot.id)}
                canDelete={permissions.canDelete}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

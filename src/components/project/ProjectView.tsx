'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useTaskStore } from '@/store/taskStore'
import { useProjectStore } from '@/store/projectStore'
import { useSnapshotStore } from '@/store/snapshotStore'
import { useUiStore } from '@/store/uiStore'
import { derivePermissions } from '@/types/rbac'
import type {
  ProjectWithMembers,
  MemberWithProfile,
  Task,
  Phase,
  Snapshot,
  UpdateRequest,
} from '@/types'
import { useRealtimeProject } from '@/hooks/useRealtimeProject'
import GanttChart from '@/components/gantt/GanttChart'
import { TaskSheet } from '@/components/sheet/TaskSheet'
import { GanttChartSquare, History, Settings, Table2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { UpdateRequestList } from '@/components/update-request/UpdateRequestList'
import Link from 'next/link'

interface ProjectViewProps {
  project: ProjectWithMembers
  members: MemberWithProfile[]
  tasks: Task[]
  phases: Phase[]
  snapshots: Snapshot[]
  currentUser: User
}

export function ProjectView({
  project,
  members,
  tasks,
  phases,
  snapshots,
  currentUser,
}: ProjectViewProps) {
  const setTasks = useTaskStore((s) => s.setTasks)
  const setPhases = useTaskStore((s) => s.setPhases)
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject)
  const setMembers = useProjectStore((s) => s.setMembers)
  const setCurrentUserRole = useProjectStore((s) => s.setCurrentUserRole)
  const setCurrentUserId = useProjectStore((s) => s.setCurrentUserId)
  const setPermissions = useProjectStore((s) => s.setPermissions)
  const setSnapshots = useSnapshotStore((s) => s.setSnapshots)
  const viewMode = useUiStore((s) => s.viewMode)
  const setViewMode = useUiStore((s) => s.setViewMode)
  const permissions = useProjectStore((s) => s.permissions)
  const [requestListOpen, setRequestListOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    setTasks(tasks)
    setPhases(phases)

    setSnapshots(snapshots)

    const currentMember = members.find((m) => m.user_id === currentUser.id)
    const role = currentMember?.role ?? 'viewer'
    const vendorPhaseIds = currentMember?.vendor_phase_ids ?? null

    setCurrentProject(project)
    setMembers(members)
    setCurrentUserRole(role)
    setCurrentUserId(currentUser.id)
    setPermissions(derivePermissions(role, vendorPhaseIds, tasks))
  }, [
    project,
    members,
    tasks,
    phases,
    snapshots,
    currentUser,
    setTasks,
    setPhases,
    setSnapshots,
    setCurrentProject,
    setMembers,
    setCurrentUserRole,
    setCurrentUserId,
    setPermissions,
  ])

  useRealtimeProject(project.id)

  const fetchPendingCount = async () => {
    const res = await fetch(`/api/update-requests?projectId=${project.id}`)
    if (!res.ok) return
    const body = await res.json() as { data: UpdateRequest[] }
    const count = body.data.filter((r) => r.status === 'pending').length
    setPendingCount(count)
  }

  useEffect(() => {
    if (!permissions?.canManageMembers) return
    void fetchPendingCount()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, permissions?.canManageMembers])

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center gap-4 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-900">{project.name}</h2>
        <div className="ml-auto flex items-center gap-2">
          {permissions?.canManageMembers && (
            <Dialog
              open={requestListOpen}
              onOpenChange={(open) => {
                setRequestListOpen(open)
                if (!open) void fetchPendingCount()
              }}
            >
              <DialogTrigger
                render={
                  <Button variant="outline" size="sm">
                    申請{pendingCount > 0 ? ` (${pendingCount}件)` : ''}
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>変更申請一覧</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-hidden min-h-0">
                  <UpdateRequestList projectId={project.id} />
                </div>
              </DialogContent>
            </Dialog>
          )}
          <button
            onClick={() => setViewMode(viewMode === 'gantt' ? 'sheet' : 'gantt')}
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label={viewMode === 'gantt' ? 'シートビューに切替' : 'ガントビューに切替'}
          >
            {viewMode === 'gantt' ? (
              <>
                <Table2 className="h-4 w-4" />
                シートビュー
              </>
            ) : (
              <>
                <GanttChartSquare className="h-4 w-4" />
                ガントビュー
              </>
            )}
          </button>
          {permissions?.canCreateSnapshot && (
            <Link
              href={`/projects/${project.id}/snapshots`}
              className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="版管理"
            >
              <History className="h-4 w-4" />
              版管理
            </Link>
          )}
          {permissions?.canManageMembers && (
            <Link
              href={`/projects/${project.id}/settings`}
              className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="プロジェクト設定"
            >
              <Settings className="h-4 w-4" />
              設定
            </Link>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {viewMode === 'gantt' ? (
          <GanttChart />
        ) : (
          <TaskSheet />
        )}
      </div>
    </div>
  )
}

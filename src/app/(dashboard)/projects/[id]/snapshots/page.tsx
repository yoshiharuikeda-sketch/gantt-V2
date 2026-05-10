import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectWithMembers } from '@/lib/repositories/projectRepository'
import { getSnapshots } from '@/lib/repositories/snapshotRepository'
import { getTasks } from '@/lib/repositories/taskRepository'
import { derivePermissions } from '@/types/rbac'
import { SnapshotList } from '@/components/snapshot/SnapshotList'
import type { MemberWithProfile, Task } from '@/types'

export default async function SnapshotsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [projectWithMembers, snapshots, tasks] = await Promise.all([
    getProjectWithMembers(supabase, projectId),
    getSnapshots(supabase, projectId),
    getTasks(supabase, projectId),
  ])

  if (!projectWithMembers) {
    redirect('/projects')
  }

  const members = projectWithMembers.project_members as MemberWithProfile[]
  const currentMember = members.find((m) => m.user_id === user.id)
  const role = currentMember?.role ?? 'viewer'
  const vendorTaskIds = currentMember?.vendor_task_ids ?? null

  const permissions = derivePermissions(role, vendorTaskIds, tasks as Task[])

  if (!permissions.canCreateSnapshot) {
    redirect(`/projects/${projectId}`)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">{projectWithMembers.name} — 版管理</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          プロジェクトの計画スナップショットを管理します
        </p>
      </div>
      <div className="flex-1 overflow-hidden px-6 py-4">
        <SnapshotList projectId={projectId} initialSnapshots={snapshots} />
      </div>
    </div>
  )
}

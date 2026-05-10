import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectWithMembers } from '@/lib/repositories/projectRepository'
import { getTasks } from '@/lib/repositories/taskRepository'
import { derivePermissions } from '@/types/rbac'
import { ProjectSettings } from '@/components/project/ProjectSettings'
import type { MemberWithProfile, Task } from '@/types'

export default async function ProjectSettingsPage({
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

  const [projectWithMembers, tasks] = await Promise.all([
    getProjectWithMembers(supabase, projectId),
    getTasks(supabase, projectId),
  ])

  if (!projectWithMembers) {
    notFound()
  }

  const members = projectWithMembers.project_members as MemberWithProfile[]
  const currentMember = members.find((m) => m.user_id === user.id)
  const role = currentMember?.role ?? 'viewer'
  const vendorTaskIds = currentMember?.vendor_task_ids ?? null

  const permissions = derivePermissions(role, vendorTaskIds, tasks as Task[])

  // メンバー管理権限がないユーザーはガントビューにリダイレクト
  if (!permissions.canManageMembers) {
    redirect(`/projects/${projectId}`)
  }

  return (
    <ProjectSettings
      project={projectWithMembers}
      members={members}
      tasks={tasks as Task[]}
      currentUserId={user.id}
      permissions={permissions}
    />
  )
}

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectWithMembers } from '@/lib/repositories/projectRepository'
import { getTasks, getPhases } from '@/lib/repositories/taskRepository'
import { derivePermissions } from '@/types/rbac'
import { ProjectSettings } from '@/components/project/ProjectSettings'
import type { MemberWithProfile, Task, Phase } from '@/types'

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

  const [projectWithMembers, tasks, phases] = await Promise.all([
    getProjectWithMembers(supabase, projectId),
    getTasks(supabase, projectId),
    getPhases(supabase, projectId),
  ])

  if (!projectWithMembers) {
    notFound()
  }

  const members = projectWithMembers.project_members as MemberWithProfile[]
  const currentMember = members.find((m) => m.user_id === user.id)
  const role = currentMember?.role ?? 'viewer'
  const vendorPhaseIds = currentMember?.vendor_phase_ids ?? null

  const permissions = derivePermissions(role, vendorPhaseIds, tasks as Task[])

  // メンバー管理権限がないユーザーはガントビューにリダイレクト
  if (!permissions.canManageMembers) {
    redirect(`/projects/${projectId}`)
  }

  return (
    <ProjectSettings
      project={projectWithMembers}
      members={members}
      tasks={tasks as Task[]}
      phases={phases as Phase[]}
      currentUserId={user.id}
      permissions={permissions}
    />
  )
}

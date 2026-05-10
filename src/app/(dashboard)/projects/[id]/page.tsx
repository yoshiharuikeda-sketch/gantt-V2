import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProjectWithMembers } from '@/lib/repositories/projectRepository'
import { getTasks, getPhases } from '@/lib/repositories/taskRepository'
import { getSnapshots } from '@/lib/repositories/snapshotRepository'
import { ProjectView } from '@/components/project/ProjectView'
import type { MemberWithProfile } from '@/types'

export default async function ProjectPage({
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
    notFound()
  }

  const [projectWithMembers, tasks, phases, snapshots] = await Promise.all([
    getProjectWithMembers(supabase, projectId),
    getTasks(supabase, projectId),
    getPhases(supabase, projectId),
    getSnapshots(supabase, projectId),
  ])

  if (!projectWithMembers) {
    notFound()
  }

  const members = projectWithMembers.project_members as MemberWithProfile[]

  return (
    <ProjectView
      project={projectWithMembers}
      members={members}
      tasks={tasks}
      phases={phases}
      snapshots={snapshots}
      currentUser={user}
    />
  )
}

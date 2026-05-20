import { createClient } from '@/lib/supabase/server'
import { ProjectList } from '@/components/dashboard/ProjectList'
import { CreateProjectDialog } from '@/components/dashboard/CreateProjectDialog'
import type { Project } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let projects: Project[] = []

  if (user) {
    const { data: memberRows, error: memberError } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', user.id)

    if (memberRows && memberRows.length > 0) {
      const projectIds = memberRows.map((r) => r.project_id)
      const { data: projectRows } = await supabase
        .from('projects')
        .select('*')
        .in('id', projectIds)
        .order('updated_at', { ascending: false })

      if (projectRows) {
        projects = projectRows
      }
    }

    // 一時デバッグ表示
    if (projects.length === 0) {
      return (
        <div className="p-8 font-mono text-xs space-y-2">
          <p>userId: {user.id}</p>
          <p>email: {user.email}</p>
          <p>memberRows: {JSON.stringify(memberRows)}</p>
          <p>memberError: {JSON.stringify(memberError)}</p>
        </div>
      )
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">プロジェクト一覧</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            参加しているプロジェクトが表示されます
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      <ProjectList projects={projects} />
    </div>
  )
}

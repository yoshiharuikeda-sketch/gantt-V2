import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Project, ProjectWithMembers } from '@/types'

type TypedSupabaseClient = SupabaseClient<Database>

export async function getProjects(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<Project[]> {
  // まず project_members からプロジェクトIDを取得
  const { data: memberRows, error: memberError } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', userId)

  if (memberError) throw new Error(memberError.message)
  if (!memberRows || memberRows.length === 0) return []

  const projectIds = memberRows.map((r) => r.project_id)

  // 次に projects を取得
  const { data: projects, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .in('id', projectIds)
    .order('updated_at', { ascending: false })

  if (projectError) throw new Error(projectError.message)
  return (projects ?? []) as Project[]
}

export async function getProjectWithMembers(
  supabase: TypedSupabaseClient,
  projectId: string
): Promise<ProjectWithMembers | null> {
  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      project_members(
        *,
        profiles(*)
      )
    `)
    .eq('id', projectId)
    .single()

  if (error) return null
  // Supabase JS v2 の型推論は Relationships:[] の場合に外部キー修飾子付き
  // select の戻り値を正しく解決できないため、検証済みの型へキャストする。
  return data as unknown as ProjectWithMembers
}

export async function createProject(
  supabase: TypedSupabaseClient,
  data: {
    name: string
    description?: string
    color: string
    client_name?: string
    project_number?: string
    owner_id: string
  }
): Promise<Project> {
  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      name: data.name,
      description: data.description ?? null,
      color: data.color,
      client_name: data.client_name ?? null,
      project_number: data.project_number ?? null,
      owner_id: data.owner_id,
      status: 'active',
      start_date: null,
      end_date: null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!project) throw new Error('Failed to create project')

  return project as Project
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Snapshot } from '@/types'

type TypedSupabaseClient = SupabaseClient<Database>

export async function getSnapshots(
  supabase: TypedSupabaseClient,
  projectId: string
): Promise<Snapshot[]> {
  const { data, error } = await supabase
    .from('snapshots')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Snapshot[]
}

export async function createSnapshot(
  supabase: TypedSupabaseClient,
  projectId: string,
  name: string,
  description?: string
): Promise<string> {
  const { data, error } = await supabase.rpc('create_snapshot', {
    p_project_id: projectId,
    p_name: name,
    p_description: description,
  })

  if (error) throw new Error(error.message)
  return data as string
}

export async function deleteSnapshot(
  supabase: TypedSupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('snapshots')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

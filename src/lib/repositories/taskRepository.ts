import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Task, Phase } from '@/types'

type TypedSupabaseClient = SupabaseClient<Database>

export async function getTasks(
  supabase: TypedSupabaseClient,
  projectId: string
): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('display_order', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Task[]
}

export async function getPhases(
  supabase: TypedSupabaseClient,
  projectId: string
): Promise<Phase[]> {
  const { data, error } = await supabase
    .from('phases')
    .select('*')
    .eq('project_id', projectId)
    .order('display_order', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Phase[]
}

export async function createTask(
  supabase: TypedSupabaseClient,
  data: Database['public']['Tables']['tasks']['Insert']
): Promise<Task> {
  const { data: task, error } = await supabase
    .from('tasks')
    .insert(data)
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!task) throw new Error('Failed to create task')
  return task as Task
}

export async function updateTask(
  supabase: TypedSupabaseClient,
  id: string,
  updates: Database['public']['Tables']['tasks']['Update'],
  currentVersion: number
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ ...updates, version: currentVersion + 1 })
    .eq('id', id)
    .eq('version', currentVersion)
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('CONFLICT')
  return data as Task
}

export async function deleteTask(
  supabase: TypedSupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function reorderTasks(
  supabase: TypedSupabaseClient,
  items: { id: string; display_order: number }[]
): Promise<void> {
  const updates = items.map(({ id, display_order }) =>
    supabase
      .from('tasks')
      .update({ display_order })
      .eq('id', id)
  )

  const results = await Promise.all(updates)
  for (const { error } of results) {
    if (error) throw new Error(error.message)
  }
}

export async function createPhase(
  supabase: TypedSupabaseClient,
  data: Database['public']['Tables']['phases']['Insert']
): Promise<Phase> {
  const { data: phase, error } = await supabase
    .from('phases')
    .insert(data)
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!phase) throw new Error('Failed to create phase')
  return phase as Phase
}

export async function updatePhase(
  supabase: TypedSupabaseClient,
  id: string,
  updates: Database['public']['Tables']['phases']['Update']
): Promise<Phase> {
  const { data, error } = await supabase
    .from('phases')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Phase not found')
  return data as Phase
}

export async function deletePhase(
  supabase: TypedSupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('phases')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTaskStore } from '@/store/taskStore'
import type { Task, Phase } from '@/types'

export function useRealtimeProject(projectId: string): void {
  const upsertTask = useTaskStore((s) => s.upsertTask)
  const removeTask = useTaskStore((s) => s.removeTask)
  const upsertPhase = useTaskStore((s) => s.upsertPhase)
  const removePhase = useTaskStore((s) => s.removePhase)

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`project:${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
        (payload) => { upsertTask(payload.new as Task) },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
        (payload) => { upsertTask(payload.new as Task) },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const id = payload.old['id']
          if (typeof id !== 'string') return
          removeTask(id)
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'phases', filter: `project_id=eq.${projectId}` },
        (payload) => { upsertPhase(payload.new as Phase) },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'phases', filter: `project_id=eq.${projectId}` },
        (payload) => { upsertPhase(payload.new as Phase) },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'phases', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const id = payload.old['id']
          if (typeof id !== 'string') return
          removePhase(id)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, upsertTask, removeTask, upsertPhase, removePhase])
}

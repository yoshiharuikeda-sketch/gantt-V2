import { useMemo } from 'react'
import { useTaskStore } from '@/store/taskStore'
import { useSnapshotStore } from '@/store/snapshotStore'
import { buildTaskTree, flattenTree } from '@/lib/utils/taskTree'
import type { TaskWithBaseline } from '@/types'

export function useBaselineOverlay(): TaskWithBaseline[] {
  const tasks = useTaskStore((s) => s.tasks)
  const activeBaseline = useSnapshotStore((s) => s.activeBaseline)
  const getTaskBaseline = useSnapshotStore((s) => s.getTaskBaseline)

  return useMemo(() => {
    const tree = buildTaskTree(tasks)
    const flat = flattenTree(tree)

    return flat.map((task): TaskWithBaseline => ({
      ...task,
      baseline: activeBaseline ? getTaskBaseline(task.id) : null,
    }))
  }, [tasks, activeBaseline, getTaskBaseline])
}

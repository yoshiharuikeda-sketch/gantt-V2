'use client'

import { useTaskStore } from '@/store/taskStore'
import { useProjectStore } from '@/store/projectStore'
import type { Task } from '@/types'

export function useVendorFilter(): Task[] {
  const tasks = useTaskStore((s) => s.tasks)
  const permissions = useProjectStore((s) => s.permissions)

  if (!permissions || permissions.visibleTaskIds === null) {
    return tasks
  }

  const visibleIds = permissions.visibleTaskIds
  return tasks.filter((task) => visibleIds.has(task.id))
}

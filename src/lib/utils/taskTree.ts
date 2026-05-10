import type { Task, TaskWithDetails } from '@/types'

/**
 * フラットなタスク配列を木構造に変換し、各タスクに depth と children を付与する。
 * display_order でソートした後、parent_task_id を元に階層を構築する。
 */
export function buildTaskTree(tasks: Task[]): TaskWithDetails[] {
  const sorted = [...tasks].sort((a, b) => a.display_order - b.display_order)
  const map = new Map<string, TaskWithDetails>()

  for (const task of sorted) {
    map.set(task.id, {
      ...task,
      assignee: null,
      vendor: null,
      phase: null,
      children: [],
      depth: 0,
    })
  }

  const roots: TaskWithDetails[] = []

  for (const task of sorted) {
    const node = map.get(task.id)!
    if (task.parent_task_id && map.has(task.parent_task_id)) {
      const parent = map.get(task.parent_task_id)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

/**
 * 木構造をフラット配列に戻す（レンダリング用）。
 * 親→子の順で深さ優先で並べる。
 */
export function flattenTree(nodes: TaskWithDetails[]): TaskWithDetails[] {
  const result: TaskWithDetails[] = []
  for (const node of nodes) {
    result.push(node)
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children as TaskWithDetails[]))
    }
  }
  return result
}

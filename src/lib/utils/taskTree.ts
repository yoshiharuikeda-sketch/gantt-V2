import type { Task, TaskWithDetails, Phase } from '@/types'

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
 * フェーズ・タスクの表示順から WBS 番号マップを構築する。
 * キー: task.id, 値: "1.1.2" のような WBS 番号文字列。
 * depth フィールドを持つ型（TaskWithDetails 等）にも、
 * depth を持たない Task にも対応（depth なしの場合は 0 とみなす）。
 */
export function buildWbsNumberMap(
  tasks: Task[],
  phases: Phase[]
): Map<string, string> {
  const map = new Map<string, string>()
  const sortedTasks = [...tasks].sort((a, b) => a.display_order - b.display_order)

  // Track which phases have been assigned a top-level WBS number
  const phaseNumbers = new Map<string, number>()
  // Track per-phase task counters for sub-numbering
  const phaseTaskCounters = new Map<string, number[]>()
  let topCounter = 0

  for (const task of sortedTasks) {
    if (task.phase_id !== null) {
      // First task in this phase: assign a new top-level number to the phase
      if (!phaseNumbers.has(task.phase_id)) {
        topCounter++
        phaseNumbers.set(task.phase_id, topCounter)
        phaseTaskCounters.set(task.phase_id, [])
      }
      const phasePrefix = String(phaseNumbers.get(task.phase_id)!)
      const counters = phaseTaskCounters.get(task.phase_id)!
      const d = (task as { depth?: number }).depth ?? 0
      while (counters.length <= d) counters.push(0)
      counters.splice(d + 1)
      counters[d] = (counters[d] ?? 0) + 1
      const suffix = counters.slice(0, d + 1).join('.')
      map.set(task.id, `${phasePrefix}.${suffix}`)
    } else {
      // Unassigned task: gets its own top-level number
      topCounter++
      map.set(task.id, String(topCounter))
    }
  }

  // Phases with no tasks get top-level numbers after all task-based entries,
  // sorted by phase.display_order
  const emptyPhases = [...phases]
    .filter((p) => !phaseNumbers.has(p.id))
    .sort((a, b) => a.display_order - b.display_order)
  for (const phase of emptyPhases) {
    topCounter++
    phaseNumbers.set(phase.id, topCounter)
  }

  return map
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

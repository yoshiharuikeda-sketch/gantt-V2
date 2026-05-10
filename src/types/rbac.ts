import type { UserRole, Task, UserPermissions } from './index'

/**
 * ベンダーが閲覧可能な task ID セットを計算する。
 * 担当タスク（assignedTaskIds）＋ その全祖先タスクが対象。
 * RLS と client-side store の両方で使用し、二重防御を実現する。
 */
export function computeVendorVisibleTaskIds(
  assignedTaskIds: string[],
  allTasks: Pick<Task, 'id' | 'parent_task_id'>[]
): Set<string> {
  const visible = new Set<string>(assignedTaskIds)
  const taskMap = new Map(allTasks.map((t) => [t.id, t]))

  for (const taskId of assignedTaskIds) {
    let current = taskMap.get(taskId)
    while (current?.parent_task_id) {
      visible.add(current.parent_task_id)
      current = taskMap.get(current.parent_task_id)
    }
  }

  return visible
}

/**
 * ロールとベンダー割当から UserPermissions を導出する。
 * プロジェクト読み込み時に1回実行し、store に保持する。
 */
export function derivePermissions(
  role: UserRole,
  vendorTaskIds: string[] | null,
  allTasks: Pick<Task, 'id' | 'parent_task_id'>[]
): UserPermissions {
  const isVendor = role === 'vendor'

  return {
    role,
    canEdit: role === 'owner' || role === 'editor' || isVendor,
    canDelete: role === 'owner',
    canManageMembers: role === 'owner',
    canCreateSnapshot: role === 'owner' || role === 'editor',
    isVendor,
    // ベンダーはスコープ未設定（null）でも全タスク閲覧を防ぐため空 Set を返す。
    // null はベンダー以外の「フィルタなし」を意味する。
    visibleTaskIds: isVendor
      ? vendorTaskIds !== null
        ? computeVendorVisibleTaskIds(vendorTaskIds, allTasks)
        : new Set<string>()
      : null,
  }
}

/**
 * ベンダーが特定タスクを編集できるか判定する。
 * 祖先タスクは閲覧可能だが編集不可（vendor_id が一致するタスクのみ編集可）。
 */
export function canVendorEditTask(
  permissions: UserPermissions,
  taskVendorId: string | null,
  currentUserId: string
): boolean {
  if (!permissions.isVendor) return permissions.canEdit
  return taskVendorId === currentUserId
}

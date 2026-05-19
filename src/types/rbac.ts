import type { UserRole, Task, UserPermissions } from './index'

/**
 * ベンダーが閲覧可能な task ID セットをフェーズ単位で計算する。
 * 担当フェーズ（assignedPhaseIds）に属する全タスクが対象。
 * RLS と client-side store の両方で使用し、二重防御を実現する。
 */
export function computeVendorVisibleTaskIds(
  assignedPhaseIds: string[],
  allTasks: Pick<Task, 'id' | 'phase_id'>[]
): Set<string> {
  const phaseSet = new Set(assignedPhaseIds)
  const visible = new Set<string>()
  for (const task of allTasks) {
    if (task.phase_id && phaseSet.has(task.phase_id)) {
      visible.add(task.id)
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
  vendorPhaseIds: string[] | null,
  allTasks: Pick<Task, 'id' | 'phase_id'>[]
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
      ? vendorPhaseIds !== null
        ? computeVendorVisibleTaskIds(vendorPhaseIds, allTasks)
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

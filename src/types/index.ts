export * from './database'

import type {
  Profile,
  Project,
  ProjectMember,
  Phase,
  Task,
  TaskSnapshot,
  UpdateRequest,
  UserRole,
} from './database'

// ─── DB JOIN 後の結合型 ───────────────────────────────────────────────────────

export type TaskWithDetails = Task & {
  assignee: Profile | null
  vendor: Profile | null
  phase: Phase | null
  children: Task[]
  depth: number
}

export type ProjectWithMembers = Project & {
  project_members: (ProjectMember & { profiles: Profile })[]
}

export type MemberWithProfile = ProjectMember & {
  profiles: Profile | null
}

export type UpdateRequestWithDetails = UpdateRequest & {
  task: Task
  requester: Profile
  assignee: Profile
  approver: Profile
}

// ─── 版管理（ゴーストバー）用 ─────────────────────────────────────────────────

export type TaskWithBaseline = TaskWithDetails & {
  baseline: TaskSnapshot | null
}

// ─── RBAC 権限セット ──────────────────────────────────────────────────────────

export type UserPermissions = {
  role: UserRole
  canEdit: boolean
  canDelete: boolean
  canManageMembers: boolean
  canInviteMembers: boolean
  canCreateSnapshot: boolean
  canAccessSettings: boolean
  isVendor: boolean
  visibleTaskIds: Set<string> | null
}

// ─── UI 型 ────────────────────────────────────────────────────────────────────

export type ViewMode = 'gantt' | 'sheet'
export type ZoomLevel = 'day' | 'week' | 'month'
export type GanttColKey = 'name' | 'start_date' | 'end_date' | 'progress' | 'vendor' | 'updated_at'

// ─── 通知データ ───────────────────────────────────────────────────────────────

export type NotificationData = {
  update_request_id?: string
  task_id?: string
  project_id?: string
  snapshot_id?: string
  role?: string
}

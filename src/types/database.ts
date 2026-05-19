export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'editor' | 'viewer' | 'limited_viewer' | 'vendor'
export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked'
export type ProjectStatus = 'active' | 'archived' | 'completed'
export type ShareType = 'task' | 'phase' | 'full'
export type RequestType = 'schedule' | 'progress' | 'status' | 'general'
export type RequestStatus = 'pending' | 'submitted' | 'approved' | 'rejected'
export type SnapshotStatus = 'draft' | 'published'

// ─── Core DB row types ────────────────────────────────────────────────────────

export type Profile = {
  id: string
  email: string
  display_name: string
  avatar_url: string | null
  vendor_company_name: string | null
  vendor_contact_info: string | null
  created_at: string
}

export type Project = {
  id: string
  name: string
  description: string | null
  owner_id: string
  status: ProjectStatus
  start_date: string | null
  end_date: string | null
  color: string
  project_number: string | null
  client_name: string | null
  created_at: string
  updated_at: string
}

export type ProjectMember = {
  id: string
  project_id: string
  user_id: string
  role: UserRole
  vendor_phase_ids: string[] | null
  invited_by: string | null
  joined_at: string
}

export type Phase = {
  id: string
  project_id: string
  name: string
  display_order: number
  color: string
  start_date: string | null
  end_date: string | null
}

export type Task = {
  id: string
  project_id: string
  phase_id: string | null
  parent_task_id: string | null
  name: string
  description: string | null
  assignee_id: string | null
  vendor_id: string | null
  start_date: string | null
  end_date: string | null
  progress: number
  status: TaskStatus
  display_order: number
  dependencies: string[]
  version: number
  updated_by: string | null
  created_at: string
  updated_at: string
}

// ─── Snapshot types (immutable after creation) ────────────────────────────────

export type TaskSnapshot = {
  readonly task_id: string
  readonly task_name: string
  readonly phase_id: string | null
  readonly parent_task_id: string | null
  readonly start_date: string | null
  readonly end_date: string | null
  readonly progress: number
  readonly status: TaskStatus
  readonly vendor_id: string | null
  readonly display_order: number
}

export type PhaseSnapshot = {
  readonly phase_id: string
  readonly name: string
  readonly color: string
  readonly display_order: number
}

export type Snapshot = {
  readonly id: string
  readonly project_id: string
  readonly name: string
  readonly description: string | null
  readonly created_by: string
  readonly created_at: string
  readonly status: SnapshotStatus
  readonly task_snapshots: TaskSnapshot[]
  readonly phase_snapshot: PhaseSnapshot[]
}

// ─── Other tables ─────────────────────────────────────────────────────────────

export type ShareScope = {
  id: string
  project_id: string
  shared_with_user_id: string
  share_type: ShareType
  scope_ids: string[]
  can_edit: boolean
  expires_at: string | null
  created_by: string | null
  created_at: string
}

export type UpdateRequest = {
  id: string
  task_id: string
  project_id: string
  requester_id: string
  assignee_id: string
  approver_id: string
  request_type: RequestType
  message: string | null
  status: RequestStatus
  response_data: Json | null
  responded_at: string | null
  approved_at: string | null
  rejection_reason: string | null
  due_date: string | null
  created_at: string
}

export type AppNotification = {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  data: Json
  is_read: boolean
  created_at: string
}

export type TaskHistory = {
  id: string
  task_id: string
  user_id: string | null
  operation: 'create' | 'update' | 'delete'
  changes: Json
  server_timestamp: string
}

// ─── Typed Supabase Database shape ───────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
        Relationships: []
      }
      projects: {
        Row: Project
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Project, 'id' | 'owner_id' | 'created_at'>>
        Relationships: []
      }
      project_members: {
        Row: ProjectMember
        Insert: Omit<ProjectMember, 'id' | 'joined_at'>
        Update: Pick<ProjectMember, 'role' | 'vendor_phase_ids'>
        Relationships: []
      }
      phases: {
        Row: Phase
        Insert: Omit<Phase, 'id'>
        Update: Partial<Omit<Phase, 'id' | 'project_id'>>
        Relationships: []
      }
      tasks: {
        Row: Task
        Insert: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'version'>
        Update: Partial<Omit<Task, 'id' | 'project_id' | 'created_at'>>
        Relationships: []
      }
      snapshots: {
        Row: Snapshot
        Insert: Omit<Snapshot, 'id' | 'created_at'>
        Update: Pick<Snapshot, 'name' | 'description' | 'status'>
        Relationships: []
      }
      share_scopes: {
        Row: ShareScope
        Insert: Omit<ShareScope, 'id' | 'created_at'>
        Update: Partial<Pick<ShareScope, 'share_type' | 'scope_ids' | 'can_edit' | 'expires_at'>>
        Relationships: []
      }
      update_requests: {
        Row: UpdateRequest
        Insert: Omit<UpdateRequest, 'id' | 'created_at'>
        Update: Partial<Pick<UpdateRequest, 'status' | 'response_data' | 'responded_at' | 'approved_at' | 'rejection_reason'>>
        Relationships: []
      }
      notifications: {
        Row: AppNotification
        Insert: Omit<AppNotification, 'id' | 'created_at'>
        Update: Pick<AppNotification, 'is_read'>
        Relationships: []
      }
      task_history: {
        Row: TaskHistory
        Insert: Omit<TaskHistory, 'id' | 'server_timestamp'>
        Update: Record<string, never>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_project_member: {
        Args: { p_project_id: string; p_user_id: string; p_roles?: string[] }
        Returns: boolean
      }
      is_vendor_task_visible: {
        Args: { p_task_id: string; p_project_id: string; p_user_id: string }
        Returns: boolean
      }
      invite_member: {
        Args: { p_project_id: string; p_email: string; p_role: string }
        Returns: Json
      }
      create_snapshot: {
        Args: { p_project_id: string; p_name: string; p_description?: string }
        Returns: string
      }
    }
  }
}

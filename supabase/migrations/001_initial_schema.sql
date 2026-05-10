-- UUID 拡張
create extension if not exists "uuid-ossp";

-- profiles（Supabase Auth の users と連携）
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz default now() not null
);

-- projects
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid references profiles(id) not null,
  status text not null default 'active' check (status in ('active', 'archived', 'completed')),
  start_date date,
  end_date date,
  color text not null default '#6366f1',
  project_number text,
  client_name text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- project_members（role は 005 で vendor を追加するため基本4種のみ）
create table project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text not null check (role in ('owner', 'editor', 'viewer', 'limited_viewer')),
  invited_by uuid references profiles(id),
  joined_at timestamptz default now() not null,
  unique (project_id, user_id)
);

-- phases
create table phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  name text not null,
  display_order integer not null default 0,
  color text not null default '#6366f1',
  start_date date,
  end_date date
);

-- tasks（vendor_id は 005 で追加するためここでは含めない）
create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  phase_id uuid references phases(id) on delete set null,
  parent_task_id uuid references tasks(id) on delete cascade,
  name text not null,
  description text,
  assignee_id uuid references profiles(id) on delete set null,
  start_date date,
  end_date date,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'blocked')),
  display_order integer not null default 0,
  dependencies jsonb not null default '[]',
  version integer not null default 1,
  updated_by uuid references profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- share_scopes
create table share_scopes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  shared_with_user_id uuid references profiles(id) on delete cascade not null,
  share_type text not null check (share_type in ('task', 'phase', 'full')),
  scope_ids uuid[] not null default '{}',
  can_edit boolean not null default false,
  expires_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now() not null
);

-- update_requests
create table update_requests (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  requester_id uuid references profiles(id) not null,
  assignee_id uuid references profiles(id) not null,
  approver_id uuid references profiles(id) not null,
  request_type text not null check (request_type in ('schedule', 'progress', 'status', 'general')),
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'approved', 'rejected')),
  response_data jsonb,
  responded_at timestamptz,
  approved_at timestamptz,
  rejection_reason text,
  due_date date,
  created_at timestamptz default now() not null
);

-- notifications
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}',
  is_read boolean not null default false,
  created_at timestamptz default now() not null
);

-- task_history
create table task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete set null,
  operation text not null check (operation in ('create', 'update', 'delete')),
  changes jsonb not null,
  server_timestamp timestamptz default now() not null
);

-- インデックス
create index idx_project_members_user on project_members(user_id);
create index idx_project_members_project on project_members(project_id);
create index idx_tasks_project on tasks(project_id);
create index idx_tasks_phase on tasks(phase_id);
create index idx_tasks_parent on tasks(parent_task_id);
create index idx_phases_project on phases(project_id);
create index idx_notifications_user on notifications(user_id, is_read);
create index idx_task_history_task on task_history(task_id);
create index idx_share_scopes_user on share_scopes(shared_with_user_id);

-- 全テーブルで RLS 有効化
alter table profiles enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table phases enable row level security;
alter table tasks enable row level security;
alter table share_scopes enable row level security;
alter table update_requests enable row level security;
alter table notifications enable row level security;
alter table task_history enable row level security;

-- profiles
create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
-- 新規登録時に insert を許可（Auth trigger で作成する場合は不要だが保険として）
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);

-- projects（メンバーシップ経由で確認）
create policy "projects_select" on projects for select
  using (exists (select 1 from project_members where project_id = id and user_id = auth.uid()));
create policy "projects_insert" on projects for insert
  with check (owner_id = auth.uid());
create policy "projects_update" on projects for update
  using (exists (select 1 from project_members where project_id = id and user_id = auth.uid() and role = 'owner'));
create policy "projects_delete" on projects for delete
  using (owner_id = auth.uid());

-- project_members
create policy "project_members_select" on project_members for select
  using (exists (select 1 from project_members pm2 where pm2.project_id = project_id and pm2.user_id = auth.uid()));
create policy "project_members_insert" on project_members for insert
  with check (exists (select 1 from project_members pm2 where pm2.project_id = project_id and pm2.user_id = auth.uid() and pm2.role = 'owner')
    or user_id = auth.uid());
create policy "project_members_update" on project_members for update
  using (exists (select 1 from project_members pm2 where pm2.project_id = project_id and pm2.user_id = auth.uid() and pm2.role = 'owner'));
create policy "project_members_delete" on project_members for delete
  using (exists (select 1 from project_members pm2 where pm2.project_id = project_id and pm2.user_id = auth.uid() and pm2.role = 'owner'));

-- phases（プロジェクトメンバーが閲覧、owner/editor が変更）
create policy "phases_select" on phases for select
  using (exists (select 1 from project_members where project_id = phases.project_id and user_id = auth.uid()));
create policy "phases_insert" on phases for insert
  with check (exists (select 1 from project_members where project_id = phases.project_id and user_id = auth.uid() and role in ('owner', 'editor')));
create policy "phases_update" on phases for update
  using (exists (select 1 from project_members where project_id = phases.project_id and user_id = auth.uid() and role in ('owner', 'editor')));
create policy "phases_delete" on phases for delete
  using (exists (select 1 from project_members where project_id = phases.project_id and user_id = auth.uid() and role in ('owner', 'editor')));

-- tasks（005 で vendor ポリシーを追加するため SELECT/UPDATE は 005 で上書き）
create policy "tasks_select" on tasks for select
  using (exists (select 1 from project_members where project_id = tasks.project_id and user_id = auth.uid()));
create policy "tasks_insert" on tasks for insert
  with check (exists (select 1 from project_members where project_id = tasks.project_id and user_id = auth.uid() and role in ('owner', 'editor')));
create policy "tasks_update" on tasks for update
  using (exists (select 1 from project_members where project_id = tasks.project_id and user_id = auth.uid() and role in ('owner', 'editor')));
create policy "tasks_delete" on tasks for delete
  using (exists (select 1 from project_members where project_id = tasks.project_id and user_id = auth.uid() and role in ('owner', 'editor')));

-- notifications（自分宛のみ）
create policy "notifications_select" on notifications for select using (user_id = auth.uid());
create policy "notifications_update" on notifications for update using (user_id = auth.uid());

-- task_history（プロジェクトメンバーが閲覧）
create policy "task_history_select" on task_history for select
  using (exists (
    select 1 from tasks t
    join project_members pm on pm.project_id = t.project_id
    where t.id = task_history.task_id and pm.user_id = auth.uid()
  ));

-- share_scopes（関係者が閲覧）
create policy "share_scopes_select" on share_scopes for select
  using (shared_with_user_id = auth.uid()
    or exists (select 1 from project_members where project_id = share_scopes.project_id and user_id = auth.uid() and role = 'owner'));

-- update_requests（関係者が閲覧）
create policy "update_requests_select" on update_requests for select
  using (requester_id = auth.uid() or assignee_id = auth.uid() or approver_id = auth.uid());

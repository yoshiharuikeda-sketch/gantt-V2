-- プロジェクトメンバーシップ確認関数（API layer の RPC で使用）
create or replace function is_project_member(
  p_project_id uuid,
  p_user_id uuid,
  p_roles text[] default null
)
returns boolean as $$
begin
  if p_roles is null then
    return exists (
      select 1 from project_members
      where project_id = p_project_id and user_id = p_user_id
    );
  else
    return exists (
      select 1 from project_members
      where project_id = p_project_id and user_id = p_user_id and role = any(p_roles)
    );
  end if;
end;
$$ language plpgsql security definer;

-- share_scopes でのタスク共有確認（限定公開用）
create or replace function is_task_shared(
  p_task_id uuid,
  p_phase_id uuid,
  p_project_id uuid,
  p_user_id uuid
)
returns boolean as $$
begin
  return exists (
    select 1 from share_scopes
    where shared_with_user_id = p_user_id
      and project_id = p_project_id
      and (expires_at is null or expires_at > now())
      and (
        (share_type = 'task' and p_task_id = any(scope_ids))
        or (share_type = 'phase' and p_phase_id = any(scope_ids))
        or share_type = 'full'
      )
  );
end;
$$ language plpgsql security definer;

-- updated_at 自動更新トリガー
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_projects_updated
  before update on projects
  for each row execute function update_updated_at();

create trigger on_tasks_updated
  before update on tasks
  for each row execute function update_updated_at();

-- Auth user 登録時に profiles を自動作成
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

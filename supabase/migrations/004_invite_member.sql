create or replace function invite_member(
  p_project_id uuid,
  p_email text,
  p_role text
)
returns jsonb as $$
declare
  v_user_id uuid;
  v_member_id uuid;
begin
  if p_role not in ('owner', 'editor', 'viewer', 'limited_viewer') then
    return jsonb_build_object('error', 'Invalid role');
  end if;

  select id into v_user_id from profiles where email = p_email;
  if v_user_id is null then
    return jsonb_build_object('error', 'User not found', 'email', p_email);
  end if;

  if exists (select 1 from project_members where project_id = p_project_id and user_id = v_user_id) then
    return jsonb_build_object('error', 'Already a member');
  end if;

  insert into project_members (project_id, user_id, role, invited_by)
  values (p_project_id, v_user_id, p_role, auth.uid())
  returning id into v_member_id;

  insert into notifications (user_id, type, title, body, data)
  values (
    v_user_id,
    'project_invitation',
    'プロジェクトに招待されました',
    'プロジェクトへの参加招待が届いています。',
    jsonb_build_object('project_id', p_project_id, 'role', p_role)
  );

  return jsonb_build_object('success', true, 'member_id', v_member_id);
end;
$$ language plpgsql security definer;

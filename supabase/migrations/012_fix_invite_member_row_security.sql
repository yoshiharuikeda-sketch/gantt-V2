-- Fix invite_member function: add SET row_security = OFF so it can insert into
-- project_members when called from auth/callback by a not-yet-member user.
-- Without this, the project_members_insert RLS policy blocks the insert
-- because the new user is not yet a member of the project.
CREATE OR REPLACE FUNCTION invite_member(
  p_project_id UUID,
  p_email TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET row_security = OFF
AS $$
DECLARE
  v_user_id UUID;
  v_member_id UUID;
BEGIN
  IF p_role NOT IN ('owner', 'editor', 'viewer', 'limited_viewer', 'vendor') THEN
    RETURN jsonb_build_object('error', 'Invalid role');
  END IF;

  SELECT id INTO v_user_id FROM profiles WHERE email = p_email;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found', 'email', p_email);
  END IF;

  IF EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'Already a member');
  END IF;

  INSERT INTO project_members (project_id, user_id, role, invited_by, vendor_phase_ids)
  VALUES (
    p_project_id,
    v_user_id,
    p_role,
    auth.uid(),
    CASE WHEN p_role = 'vendor' THEN '{}'::UUID[] ELSE NULL END
  )
  RETURNING id INTO v_member_id;

  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    v_user_id,
    'project_invitation',
    'プロジェクトに招待されました',
    'プロジェクトへの参加招待が届いています。',
    jsonb_build_object('project_id', p_project_id, 'role', p_role)
  );

  RETURN jsonb_build_object('success', true, 'member_id', v_member_id);
END;
$$;

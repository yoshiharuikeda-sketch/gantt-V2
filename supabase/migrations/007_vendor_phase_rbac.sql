-- vendor_task_ids を vendor_phase_ids に完全置き換え

-- 新カラム追加
ALTER TABLE project_members
  ADD COLUMN IF NOT EXISTS vendor_phase_ids UUID[] DEFAULT NULL;

-- 既存のvendorメンバーのvendor_task_idsが空配列{}なら空配列{}で初期化
UPDATE project_members
  SET vendor_phase_ids = '{}'::UUID[]
  WHERE role = 'vendor' AND vendor_task_ids IS NOT NULL;

-- 旧カラム削除
ALTER TABLE project_members
  DROP COLUMN IF EXISTS vendor_task_ids;

-- 旧RLS関数を置き換え（フェーズベースの可視判定）
CREATE OR REPLACE FUNCTION is_vendor_task_visible(
  p_task_id UUID,
  p_project_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_vendor_phase_ids UUID[];
  v_task_phase_id UUID;
BEGIN
  -- ベンダーメンバーのvendor_phase_idsを取得
  SELECT vendor_phase_ids INTO v_vendor_phase_ids
  FROM project_members
  WHERE project_id = p_project_id
    AND user_id = p_user_id
    AND role = 'vendor';

  IF v_vendor_phase_ids IS NULL THEN
    RETURN FALSE;
  END IF;

  -- タスクのphase_idを取得
  SELECT phase_id INTO v_task_phase_id
  FROM tasks WHERE id = p_task_id;

  -- タスクのフェーズがベンダーの担当フェーズに含まれるか
  RETURN v_task_phase_id = ANY(v_vendor_phase_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- invite_member関数を更新（vendor_phase_idsを使用）
CREATE OR REPLACE FUNCTION invite_member(
  p_project_id UUID,
  p_email TEXT,
  p_role TEXT
)
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ベンダーRBACの追加マイグレーション

-- project_members.role に 'vendor' を追加
ALTER TABLE project_members
  DROP CONSTRAINT IF EXISTS project_members_role_check;

ALTER TABLE project_members
  ADD CONSTRAINT project_members_role_check
  CHECK (role IN ('owner', 'editor', 'viewer', 'limited_viewer', 'vendor'));

-- ベンダーが担当するtask IDの配列（NULL=非ベンダー、空配列=未割当ベンダー）
ALTER TABLE project_members
  ADD COLUMN IF NOT EXISTS vendor_task_ids UUID[] DEFAULT NULL;

-- tasks にベンダー担当者IDを追加
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- profiles にベンダー会社情報を追加
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vendor_company_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vendor_contact_info TEXT DEFAULT NULL;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_tasks_vendor_id ON tasks(vendor_id);
CREATE INDEX IF NOT EXISTS idx_project_members_vendor
  ON project_members(project_id, role)
  WHERE role = 'vendor';

-- ベンダーがタスクを閲覧可能かチェックするRLS用関数
-- 担当タスク OR その祖先タスクであれば true を返す
CREATE OR REPLACE FUNCTION is_vendor_task_visible(
  p_task_id UUID,
  p_project_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_vendor_task_ids UUID[];
  v_check_id UUID;
  v_parent_id UUID;
BEGIN
  SELECT vendor_task_ids INTO v_vendor_task_ids
  FROM project_members
  WHERE project_id = p_project_id
    AND user_id = p_user_id
    AND role = 'vendor';

  IF v_vendor_task_ids IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_task_id = ANY(v_vendor_task_ids) THEN
    RETURN TRUE;
  END IF;

  -- 各担当タスクから祖先を辿って p_task_id が祖先かチェック
  FOREACH v_check_id IN ARRAY v_vendor_task_ids LOOP
    v_parent_id := v_check_id;
    LOOP
      SELECT parent_task_id INTO v_parent_id
      FROM tasks WHERE id = v_parent_id;

      EXIT WHEN v_parent_id IS NULL;

      IF v_parent_id = p_task_id THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  END LOOP;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- tasks SELECT ポリシー更新（ベンダー閲覧を追加）
DROP POLICY IF EXISTS "tasks_select" ON tasks;
CREATE POLICY "tasks_select" ON tasks FOR SELECT
  USING (
    is_project_member(project_id, auth.uid(), ARRAY['owner', 'editor', 'viewer'])
    OR is_task_shared(id, phase_id, project_id, auth.uid())
    OR is_vendor_task_visible(id, project_id, auth.uid())
  );

-- tasks UPDATE ポリシー更新（ベンダーは vendor_id が自分のタスクのみ）
DROP POLICY IF EXISTS "tasks_update" ON tasks;
CREATE POLICY "tasks_update" ON tasks FOR UPDATE
  USING (
    is_project_member(project_id, auth.uid(), ARRAY['owner', 'editor'])
    OR (
      vendor_id = auth.uid()
      AND is_project_member(project_id, auth.uid(), ARRAY['vendor'])
    )
  );

-- invite_member 関数を 'vendor' ロール対応に更新
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

  INSERT INTO project_members (project_id, user_id, role, invited_by, vendor_task_ids)
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

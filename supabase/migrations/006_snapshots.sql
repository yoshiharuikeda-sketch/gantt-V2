-- 版管理（スナップショット）テーブルの作成

CREATE TABLE IF NOT EXISTS snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published')),
  -- タスクとフェーズの全状態をJSONBで保存（作成後イミュータブル）
  task_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  phase_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  -- updated_at は意図的に省略（スナップショットデータは不変）
);

CREATE INDEX IF NOT EXISTS idx_snapshots_project ON snapshots(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_created_by ON snapshots(created_by);

-- RLS
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_select" ON snapshots FOR SELECT
  USING (is_project_member(project_id, auth.uid()));

CREATE POLICY "snapshots_insert" ON snapshots FOR INSERT
  WITH CHECK (
    is_project_member(project_id, auth.uid(), ARRAY['owner', 'editor'])
    AND created_by = auth.uid()
  );

-- name/description/status のみ変更可（スナップショットデータは不変）
CREATE POLICY "snapshots_update" ON snapshots FOR UPDATE
  USING (is_project_member(project_id, auth.uid(), ARRAY['owner', 'editor']));

CREATE POLICY "snapshots_delete" ON snapshots FOR DELETE
  USING (is_project_member(project_id, auth.uid(), ARRAY['owner']));

-- スナップショットデータの不変性を保証するトリガー
CREATE OR REPLACE FUNCTION prevent_snapshot_data_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.task_snapshots IS DISTINCT FROM NEW.task_snapshots
    OR OLD.phase_snapshot IS DISTINCT FROM NEW.phase_snapshot
    OR OLD.created_by IS DISTINCT FROM NEW.created_by
    OR OLD.project_id IS DISTINCT FROM NEW.project_id
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'Snapshot data fields are immutable after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_snapshot_update
  BEFORE UPDATE ON snapshots
  FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_data_mutation();

-- スナップショット作成関数（現在のプロジェクト状態をアトミックに取得）
CREATE OR REPLACE FUNCTION create_snapshot(
  p_project_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_snapshot_id UUID;
  v_task_snapshots JSONB;
  v_phase_snapshot JSONB;
BEGIN
  IF NOT is_project_member(p_project_id, auth.uid(), ARRAY['owner', 'editor']) THEN
    RAISE EXCEPTION 'Insufficient permissions to create snapshot';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'task_id', id,
      'task_name', name,
      'phase_id', phase_id,
      'parent_task_id', parent_task_id,
      'start_date', start_date,
      'end_date', end_date,
      'progress', progress,
      'status', status,
      'vendor_id', vendor_id,
      'display_order', display_order
    )
    ORDER BY display_order
  )
  INTO v_task_snapshots
  FROM tasks
  WHERE project_id = p_project_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'phase_id', id,
      'name', name,
      'color', color,
      'display_order', display_order
    )
    ORDER BY display_order
  )
  INTO v_phase_snapshot
  FROM phases
  WHERE project_id = p_project_id;

  INSERT INTO snapshots (
    project_id, name, description, created_by,
    task_snapshots, phase_snapshot
  )
  VALUES (
    p_project_id,
    p_name,
    p_description,
    auth.uid(),
    COALESCE(v_task_snapshots, '[]'::jsonb),
    COALESCE(v_phase_snapshot, '[]'::jsonb)
  )
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

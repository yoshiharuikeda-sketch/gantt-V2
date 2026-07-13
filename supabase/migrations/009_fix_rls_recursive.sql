-- Fix recursive RLS: projects_select → project_members → project_members_select (self-referential)
-- Use SECURITY DEFINER functions to read project_members without RLS applied

CREATE OR REPLACE FUNCTION get_my_project_ids()
RETURNS SETOF uuid LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT project_id FROM project_members WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_project_member(p_project_id uuid)
RETURNS boolean LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  )
$$;

-- Fix projects_select to avoid querying project_members directly (prevents recursive RLS)
DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects FOR SELECT
  USING (id IN (SELECT get_my_project_ids()));

-- Fix project_members_select to avoid self-referential query
DROP POLICY IF EXISTS "project_members_select" ON project_members;
CREATE POLICY "project_members_select" ON project_members FOR SELECT
  USING (is_project_member(project_id));

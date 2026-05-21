-- Migration 010: Fix RLS policies and SECURITY DEFINER functions
--
-- This migration documents SQL changes applied directly in the Supabase SQL Editor
-- that were not captured in previous migration files. It fixes several RLS issues:
--   1. profiles SELECT was too restrictive (users could not read other members' profiles)
--   2. projects SELECT did not allow owners to see their own project after INSERT
--   3. project_members SELECT relied solely on SECURITY DEFINER function (circular RLS risk)
--   4. SECURITY DEFINER functions lacked SET row_security = OFF, so RLS still applied inside them
--   5. project_members INSERT did not allow a user to add themselves as owner on project creation

-- Fix profiles SELECT policy: allow all authenticated users to read profiles (not just own)
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);

-- Fix projects_select to also allow owner to see their own project (needed for RETURNING after INSERT)
DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects FOR SELECT
  USING (
    owner_id = auth.uid()
    OR id IN (SELECT get_my_project_ids())
  );

-- Fix project_members_select: add direct user_id check to avoid relying solely on SECURITY DEFINER function
DROP POLICY IF EXISTS "project_members_select" ON project_members;
CREATE POLICY "project_members_select" ON project_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR project_id IN (SELECT get_my_project_ids())
  );

-- Fix SECURITY DEFINER functions: add SET row_security = OFF to actually bypass RLS
CREATE OR REPLACE FUNCTION get_my_project_ids()
RETURNS SETOF uuid LANGUAGE SQL SECURITY DEFINER STABLE
SET row_security = OFF
AS $$
  SELECT project_id FROM project_members WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_project_member(p_project_id uuid)
RETURNS boolean LANGUAGE SQL SECURITY DEFINER STABLE
SET row_security = OFF
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  )
$$;

-- Fix project_members INSERT: allow adding self as owner (new project) or existing members to add others
DROP POLICY IF EXISTS "project_members_insert" ON project_members;
CREATE POLICY "project_members_insert" ON project_members FOR INSERT
  WITH CHECK (
    (user_id = auth.uid() AND role = 'owner')
    OR is_project_member(project_id)
  );

CREATE TABLE pending_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage pending invites"
ON pending_invites
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = pending_invites.project_id
      AND user_id = auth.uid()
      AND role = 'owner'
  )
);

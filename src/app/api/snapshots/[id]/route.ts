import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteSnapshot } from '@/lib/repositories/snapshotRepository'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    // スナップショットが属するプロジェクトを取得して owner のみ削除可
    const { data: snapshotRow, error: snapshotFetchError } = await supabase
      .from('snapshots')
      .select('project_id')
      .eq('id', id)
      .single()

    if (snapshotFetchError || !snapshotRow) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
    }

    const { data: isMember } = await supabase.rpc('is_project_member', {
      p_project_id: snapshotRow.project_id,
      p_user_id: user.id,
      p_roles: ['owner'],
    })
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await deleteSnapshot(supabase, id)
    return NextResponse.json({ data: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSnapshots, createSnapshot } from '@/lib/repositories/snapshotRepository'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  // メンバーシップ確認
  const { data: isMember } = await supabase.rpc('is_project_member', {
    p_project_id: projectId,
    p_user_id: user.id,
  })
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const snapshots = await getSnapshots(supabase, projectId)
    return NextResponse.json({ data: snapshots })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json() as { project_id: string; name: string; description?: string }

    if (!body.project_id || !body.name) {
      return NextResponse.json(
        { error: 'project_id and name are required' },
        { status: 400 }
      )
    }

    // owner / editor のみスナップショット作成可
    const { data: isMember } = await supabase.rpc('is_project_member', {
      p_project_id: body.project_id,
      p_user_id: user.id,
      p_roles: ['owner', 'editor'],
    })
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const snapshotId = await createSnapshot(
      supabase,
      body.project_id,
      body.name,
      body.description
    )
    return NextResponse.json({ data: snapshotId }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

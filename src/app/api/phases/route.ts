import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getPhases,
  createPhase,
  updatePhase,
  deletePhase,
} from '@/lib/repositories/taskRepository'
import type { Database } from '@/types/database'

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
    const phases = await getPhases(supabase, projectId)
    return NextResponse.json({ data: phases })
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
    const body = await req.json() as Database['public']['Tables']['phases']['Insert']

    if (!body.project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    // editor 以上のみ作成可
    const { data: isMember } = await supabase.rpc('is_project_member', {
      p_project_id: body.project_id,
      p_user_id: user.id,
      p_roles: ['owner', 'editor'],
    })
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const phase = await createPhase(supabase, body)
    return NextResponse.json({ data: phase }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json() as { id: string } & Database['public']['Tables']['phases']['Update']
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // フェーズが属するプロジェクトを取得して editor 以上のみ更新可
    const { data: phaseRow, error: phaseFetchError } = await supabase
      .from('phases')
      .select('project_id')
      .eq('id', id)
      .single()

    if (phaseFetchError || !phaseRow) {
      return NextResponse.json({ error: 'Phase not found' }, { status: 404 })
    }

    const { data: isMember } = await supabase.rpc('is_project_member', {
      p_project_id: phaseRow.project_id,
      p_user_id: user.id,
      p_roles: ['owner', 'editor'],
    })
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const phase = await updatePhase(supabase, id, updates)
    return NextResponse.json({ data: phase })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  try {
    // フェーズが属するプロジェクトを取得して owner のみ削除可
    const { data: phaseRow, error: phaseFetchError } = await supabase
      .from('phases')
      .select('project_id')
      .eq('id', id)
      .single()

    if (phaseFetchError || !phaseRow) {
      return NextResponse.json({ error: 'Phase not found' }, { status: 404 })
    }

    const { data: isMember } = await supabase.rpc('is_project_member', {
      p_project_id: phaseRow.project_id,
      p_user_id: user.id,
      p_roles: ['owner'],
    })
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await deletePhase(supabase, id)
    return NextResponse.json({ data: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

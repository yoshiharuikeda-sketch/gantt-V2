import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
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

  // Explicitly allow all roles including vendor — do not filter by role here
  // so that future RPC changes cannot silently break vendor read access
  const { data: isMember } = await supabase.rpc('is_project_member', {
    p_project_id: projectId,
    p_user_id: user.id,
    p_roles: ['owner', 'editor', 'viewer', 'limited_viewer', 'vendor'],
  })
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const tasks = await getTasks(supabase, projectId)
    return NextResponse.json({ data: tasks })
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
    const body = await req.json() as Database['public']['Tables']['tasks']['Insert']

    if (!body.project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    // editor 以上 または vendor のみ作成可
    const { data: isEditorOrAbove } = await supabase.rpc('is_project_member', {
      p_project_id: body.project_id,
      p_user_id: user.id,
      p_roles: ['owner', 'editor'],
    })

    if (!isEditorOrAbove) {
      // vendor かどうか確認
      const { data: memberRow, error: memberError } = await supabase
        .from('project_members')
        .select('role, vendor_phase_ids')
        .eq('project_id', body.project_id)
        .eq('user_id', user.id)
        .single()

      if (memberError || !memberRow || memberRow.role !== 'vendor') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // ベンダーは phase_id が自分の担当フェーズスコープ内である必要がある
      if (!body.phase_id) {
        return NextResponse.json({ error: 'Forbidden: vendor must specify a phase within their scope' }, { status: 403 })
      }

      const vendorPhaseIds: string[] = memberRow.vendor_phase_ids ?? []
      if (!vendorPhaseIds.includes(body.phase_id)) {
        return NextResponse.json({ error: 'Forbidden: phase is not within vendor scope' }, { status: 403 })
      }
    }

    const task = await createTask(supabase, body)
    return NextResponse.json({ data: task }, { status: 201 })
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
    const body = await req.json() as {
      id: string
      version: number
    } & Database['public']['Tables']['tasks']['Update']

    const { id, version, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }
    if (version === undefined || version === null) {
      return NextResponse.json({ error: 'version is required' }, { status: 400 })
    }

    // タスクが属するプロジェクトを取得してメンバーシップ確認
    const { data: taskRow, error: taskFetchError } = await supabase
      .from('tasks')
      .select('project_id, vendor_id')
      .eq('id', id)
      .single()

    if (taskFetchError || !taskRow) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const { data: isEditorOrAbove } = await supabase.rpc('is_project_member', {
      p_project_id: taskRow.project_id,
      p_user_id: user.id,
      p_roles: ['owner', 'editor'],
    })

    if (!isEditorOrAbove) {
      // vendor かどうか確認し、担当タスクのみ更新許可
      const { data: memberRow, error: memberError } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', taskRow.project_id)
        .eq('user_id', user.id)
        .single()

      if (memberError || !memberRow || memberRow.role !== 'vendor') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      if (taskRow.vendor_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden: vendor can only update their own tasks' }, { status: 403 })
      }
    }

    const task = await updateTask(supabase, id, updates, version)
    return NextResponse.json({ data: task })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'CONFLICT') {
      return NextResponse.json({ error: 'CONFLICT' }, { status: 409 })
    }
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
    // タスクが属するプロジェクトを取得してアクセス確認
    const { data: taskRow, error: taskFetchError } = await supabase
      .from('tasks')
      .select('project_id, vendor_id')
      .eq('id', id)
      .single()

    if (taskFetchError || !taskRow) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // owner のみ削除可（editor・vendor は owner 相当の権限なし）
    const { data: isOwner } = await supabase.rpc('is_project_member', {
      p_project_id: taskRow.project_id,
      p_user_id: user.id,
      p_roles: ['owner'],
    })

    if (!isOwner) {
      // vendor かどうか確認し、担当タスクのみ削除許可
      const { data: memberRow, error: memberError } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', taskRow.project_id)
        .eq('user_id', user.id)
        .single()

      if (memberError || !memberRow || memberRow.role !== 'vendor') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      if (taskRow.vendor_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden: vendor can only delete their own tasks' }, { status: 403 })
      }
    }

    await deleteTask(supabase, id)
    return NextResponse.json({ data: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

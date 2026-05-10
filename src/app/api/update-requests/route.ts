import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { RequestType } from '@/types/database'

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

  const { data: isMember } = await supabase.rpc('is_project_member', {
    p_project_id: projectId,
    p_user_id: user.id,
  })
  if (!isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('update_requests')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json() as {
      task_id: string
      project_id: string
      request_type: RequestType
      message?: string
      due_date?: string
    }

    const { task_id, project_id, request_type, message, due_date } = body

    if (!task_id || !project_id || !request_type) {
      return NextResponse.json({ error: 'task_id, project_id, request_type are required' }, { status: 400 })
    }

    const { data: isMember } = await supabase.rpc('is_project_member', {
      p_project_id: project_id,
      p_user_id: user.id,
    })
    if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: taskRow, error: taskError } = await supabase
      .from('tasks')
      .select('assignee_id')
      .eq('id', task_id)
      .eq('project_id', project_id)
      .single()

    if (taskError || !taskRow) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const { data: ownerRow, error: ownerError } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', project_id)
      .eq('role', 'owner')
      .single()

    if (ownerError || !ownerRow) {
      return NextResponse.json({ error: 'Project owner not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('update_requests')
      .insert({
        task_id,
        project_id,
        requester_id: user.id,
        assignee_id: taskRow.assignee_id ?? user.id,
        approver_id: ownerRow.user_id,
        request_type,
        message: message ?? null,
        status: 'pending',
        response_data: null,
        responded_at: null,
        approved_at: null,
        rejection_reason: null,
        due_date: due_date ?? null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
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
      action: 'approve' | 'reject'
      rejection_reason?: string
    }

    const { id, action, rejection_reason } = body

    if (!id || !action) {
      return NextResponse.json({ error: 'id and action are required' }, { status: 400 })
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const { data: requestRow, error: requestError } = await supabase
      .from('update_requests')
      .select('project_id')
      .eq('id', id)
      .single()

    if (requestError || !requestRow) {
      return NextResponse.json({ error: 'Update request not found' }, { status: 404 })
    }

    const { data: isOwnerOrEditor } = await supabase.rpc('is_project_member', {
      p_project_id: requestRow.project_id,
      p_user_id: user.id,
      p_roles: ['owner', 'editor'],
    })

    if (!isOwnerOrEditor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date().toISOString()

    const updatePayload =
      action === 'approve'
        ? { status: 'approved' as const, approved_at: now, responded_at: now }
        : {
            status: 'rejected' as const,
            rejection_reason: rejection_reason ?? null,
            responded_at: now,
          }

    const { data, error } = await supabase
      .from('update_requests')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'

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
    const { data, error } = await supabase
      .from('project_members')
      .select('*, profiles(*)')
      .eq('project_id', projectId)

    if (error) throw new Error(error.message)
    return NextResponse.json({ data: data ?? [] })
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
    const body = await req.json() as { project_id: string; email: string; role: string }

    if (!body.project_id || !body.email || !body.role) {
      return NextResponse.json(
        { error: 'project_id, email, and role are required' },
        { status: 400 }
      )
    }

    // owner のみメンバー招待可
    const { data: isOwner } = await supabase.rpc('is_project_member', {
      p_project_id: body.project_id,
      p_user_id: user.id,
      p_roles: ['owner'],
    })
    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await supabase.rpc('invite_member', {
      p_project_id: body.project_id,
      p_email: body.email,
      p_role: body.role,
    })

    if (error) {
      // If the user doesn't exist yet, store a pending invite instead
      if (error.message === 'User not found') {
        const { error: pendingError } = await supabase
          .from('pending_invites')
          .insert({
            project_id: body.project_id,
            email: body.email,
            role: body.role,
            invited_by: user.id,
          })
        if (pendingError) {
          return NextResponse.json(
            { error: `Failed to store pending invite: ${pendingError.message}` },
            { status: 500 }
          )
        }
        return NextResponse.json({ pending: true }, { status: 201 })
      }
      throw new Error(error.message)
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
      role?: UserRole
      vendor_phase_ids?: string[] | null
    }

    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // Database Update型は role と vendor_phase_ids の両方が必須のため、確実な値で更新する
    const currentMember = await supabase
      .from('project_members')
      .select('role, vendor_phase_ids, project_id')
      .eq('id', body.id)
      .single()

    if (currentMember.error || !currentMember.data) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // owner のみロール変更・vendor_phase_ids 更新可
    const { data: isOwner } = await supabase.rpc('is_project_member', {
      p_project_id: currentMember.data.project_id,
      p_user_id: user.id,
      p_roles: ['owner'],
    })
    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updatePayload: { role: UserRole; vendor_phase_ids: string[] | null } = {
      role: body.role !== undefined ? body.role : currentMember.data.role,
      vendor_phase_ids:
        body.vendor_phase_ids !== undefined
          ? body.vendor_phase_ids
          : currentMember.data.vendor_phase_ids,
    }

    const { data, error } = await supabase
      .from('project_members')
      .update(updatePayload)
      .eq('id', body.id)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ data })
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

  const memberId = req.nextUrl.searchParams.get('memberId')
  if (!memberId) {
    return NextResponse.json({ error: 'memberId is required' }, { status: 400 })
  }

  try {
    // 削除対象メンバーの情報を取得
    const { data: targetMember, error: fetchError } = await supabase
      .from('project_members')
      .select('project_id, user_id, role')
      .eq('id', memberId)
      .single()

    if (fetchError || !targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // owner のみメンバー削除可
    const { data: isOwner } = await supabase.rpc('is_project_member', {
      p_project_id: targetMember.project_id,
      p_user_id: user.id,
      p_roles: ['owner'],
    })
    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // owner 自身の削除を防止（プロジェクトの孤立を防ぐ）
    if (targetMember.role === 'owner' && targetMember.user_id === user.id) {
      return NextResponse.json(
        { error: 'Cannot remove yourself as the project owner' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('id', memberId)

    if (error) throw new Error(error.message)
    return NextResponse.json({ data: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

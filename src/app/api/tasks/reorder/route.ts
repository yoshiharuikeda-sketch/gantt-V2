import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reorderTasks } from '@/lib/repositories/taskRepository'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json() as {
      projectId: string
      items: { id: string; display_order: number }[]
    }

    if (!body.projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 400 })
    }

    // editor 以上のみ並び替え可
    const { data: isMember } = await supabase.rpc('is_project_member', {
      p_project_id: body.projectId,
      p_user_id: user.id,
      p_roles: ['owner', 'editor'],
    })
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await reorderTasks(supabase, body.items)
    return NextResponse.json({ data: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

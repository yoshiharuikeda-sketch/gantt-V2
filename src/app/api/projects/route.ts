import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProjects, createProject } from '@/lib/repositories/projectRepository'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const projects = await getProjects(supabase, user.id)
    return NextResponse.json({ data: projects })
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
    const body = await req.json() as {
      name: string
      description?: string
      color?: string
      client_name?: string
      project_number?: string
    }

    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const project = await createProject(supabase, {
      name: body.name,
      description: body.description,
      color: body.color ?? '#6366F1',
      client_name: body.client_name,
      project_number: body.project_number,
      owner_id: user.id,
    })

    // owner として project_members に追加
    const { error: memberError } = await supabase.from('project_members').insert({
      project_id: project.id,
      user_id: user.id,
      role: 'owner',
      vendor_task_ids: null,
      invited_by: null,
    })

    if (memberError) {
      // プロジェクトが作成されたがメンバー追加に失敗した場合はロールバック
      await supabase.from('projects').delete().eq('id', project.id)
      throw new Error(memberError.message)
    }

    return NextResponse.json({ data: project }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

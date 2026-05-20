import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' })
  }

  const { data: members, error } = await supabase
    .from('project_members')
    .select('project_id, role')
    .eq('user_id', user.id)

  return NextResponse.json({
    userId: user.id,
    email: user.email,
    members,
    membersError: error?.message ?? null,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = req.nextUrl.searchParams.get('q') ?? ''
  if (!q || q.length < 2) {
    return NextResponse.json([])
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('contacts')
    .select('name, email, department')
    .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = (data ?? []).map((row: any) => ({
    name: (row.name as string) ?? '',
    email: (row.email as string) ?? '',
    department: (row.department as string) ?? '',
  }))

  return NextResponse.json(results)
}

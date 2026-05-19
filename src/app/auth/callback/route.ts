import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    )
  }

  // メール確認後に profiles を upsert する（signUp 時に insert できなかった場合のフォールバック）
  if (data.user) {
    const displayName =
      (data.user.user_metadata?.display_name as string | undefined) ??
      data.user.email ??
      'Unknown'

    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: data.user.id,
        email: data.user.email ?? '',
        display_name: displayName,
        avatar_url: null,
        vendor_company_name: null,
        vendor_contact_info: null,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    )

    if (profileError) {
      console.error('[auth/callback] profiles upsert failed:', profileError)
      return NextResponse.redirect(`${origin}/login?error=profile_setup_failed`)
    }

    // Process any pending invites for this email
    if (data.user.email) {
      try {
        const { data: pendingInvites, error: fetchError } = await supabase
          .from('pending_invites')
          .select('*')
          .eq('email', data.user.email)

        if (fetchError) {
          console.error('[auth/callback] failed to fetch pending invites:', fetchError)
        } else if (pendingInvites && pendingInvites.length > 0) {
          for (const invite of pendingInvites) {
            const { error: rpcError } = await supabase.rpc('invite_member', {
              p_project_id: invite.project_id,
              p_email: data.user.email,
              p_role: invite.role,
            })
            if (rpcError) {
              console.error(
                `[auth/callback] invite_member RPC failed for project ${invite.project_id}:`,
                rpcError
              )
            }
          }

          const { error: deleteError } = await supabase
            .from('pending_invites')
            .delete()
            .eq('email', data.user.email)

          if (deleteError) {
            console.error('[auth/callback] failed to delete pending invites:', deleteError)
          }
        }
      } catch (err) {
        console.error('[auth/callback] unexpected error processing pending invites:', err)
      }
    }
  }

  return NextResponse.redirect(`${origin}/`)
}

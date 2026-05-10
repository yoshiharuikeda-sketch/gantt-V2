'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function useSignOut() {
  const router = useRouter()

  return async function signOut() {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('[useSignOut] signOut failed:', error)
    }
    router.push('/login')
  }
}

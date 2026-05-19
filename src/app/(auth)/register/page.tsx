'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // メール確認後に callback が走りセッションが確立されるまで profiles は upsert できないため、
        // display_name は auth metadata として持ち、callback 後に profiles へ insert するのが安全。
        // ただしここでは確認メールなしの即時登録も考慮し、signUp 直後に user が返れば insert を試みる。
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { display_name: displayName },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // メール確認が不要な場合（ローカル開発など）は user が即時返ってくる
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        display_name: displayName,
        avatar_url: null,
        vendor_company_name: null,
        vendor_contact_info: null,
      })

      // profiles の重複 insert はエラーになるが確認メール有りの場合は後続の callback で処理するため無視
      if (profileError && profileError.code !== '23505') {
        setError(profileError.message)
        setLoading(false)
        return
      }
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="text-4xl mb-4">📧</div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">確認メールを送信しました</h2>
        <p className="text-sm text-slate-500 mb-6">
          {email} に確認メールを送りました。メール内のリンクをクリックしてアカウントを有効化してください。
        </p>
        <Link href="/login" className="text-indigo-600 hover:underline text-sm font-medium">
          ログインページへ戻る
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-8">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">アカウント作成</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="displayName">表示名</Label>
          <Input
            id="displayName"
            type="text"
            autoComplete="name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="山田 太郎"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">メールアドレス</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">パスワード</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8文字以上"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? '登録中...' : 'アカウントを作成する'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        すでにアカウントをお持ちの方は{' '}
        <Link href="/login" className="text-indigo-600 hover:underline font-medium">
          ログインはこちら
        </Link>
      </p>
    </div>
  )
}

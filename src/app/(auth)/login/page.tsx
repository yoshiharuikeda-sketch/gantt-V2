'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // パスワードリセット関連の state
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    const next = searchParams.get('next') ?? '/'
    window.location.href = next
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setResetError(null)
    setResetMessage(null)
    setResetLoading(true)

    const supabase = createClient()
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })

    if (resetErr) {
      setResetError(resetErr.message)
    } else {
      setResetMessage('パスワードリセット用のメールを送信しました。メールをご確認ください。')
    }
    setResetLoading(false)
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-8">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">ログイン</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <div className="text-right">
            <button
              type="button"
              onClick={() => {
                setShowReset(!showReset)
                setResetError(null)
                setResetMessage(null)
              }}
              className="text-xs text-indigo-600 hover:underline"
            >
              パスワードをお忘れですか？
            </button>
          </div>
        </div>

        {/* パスワードリセット インライン入力 */}
        {showReset && (
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
            <p className="text-sm text-slate-600">
              登録済みのメールアドレスを入力してください。パスワードリセット用のリンクをお送りします。
            </p>
            <form onSubmit={handleResetPassword} className="space-y-2">
              <Input
                type="email"
                autoComplete="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@example.com"
              />
              {resetError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {resetError}
                </p>
              )}
              {resetMessage && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                  {resetMessage}
                </p>
              )}
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={resetLoading}
              >
                {resetLoading ? '送信中...' : 'リセットメールを送信'}
              </Button>
            </form>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'ログイン中...' : 'ログイン'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        アカウントをお持ちでない方は{' '}
        <Link href="/register" className="text-indigo-600 hover:underline font-medium">
          アカウントを作成する
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

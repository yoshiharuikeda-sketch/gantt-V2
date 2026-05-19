'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { VendorMemberTaskScope } from '@/components/vendor/VendorMemberTaskScope'
import { VendorTaskAssignment } from '@/components/vendor/VendorTaskAssignment'
import { useTaskStore } from '@/store/taskStore'
import { useProjectStore } from '@/store/projectStore'
import type {
  Project,
  MemberWithProfile,
  Task,
  Phase,
  UserPermissions,
  UserRole,
} from '@/types'

interface ProjectSettingsProps {
  project: Project
  members: MemberWithProfile[]
  tasks: Task[]
  phases: Phase[]
  currentUserId: string
  permissions: UserPermissions
}

// ロールは招待フォームで選択可能なものに制限する
const INTERNAL_ROLES: UserRole[] = ['editor', 'viewer']
const CHANGEABLE_ROLES: UserRole[] = ['owner', 'editor', 'viewer']

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'オーナー',
  editor: '編集者',
  viewer: '閲覧者',
  limited_viewer: '限定閲覧者',
  vendor: 'ベンダー',
}

export function ProjectSettings({
  project,
  members: initialMembers,
  tasks,
  phases,
  currentUserId,
  permissions,
}: ProjectSettingsProps) {
  const router = useRouter()

  const [infoName, setInfoName] = useState(project.name)
  const [infoDescription, setInfoDescription] = useState(project.description ?? '')
  const [infoColor, setInfoColor] = useState(project.color)
  const [infoClientName, setInfoClientName] = useState(project.client_name ?? '')
  const [infoProjectNumber, setInfoProjectNumber] = useState(project.project_number ?? '')
  const [infoStartDate, setInfoStartDate] = useState(project.start_date ?? '')
  const [infoEndDate, setInfoEndDate] = useState(project.end_date ?? '')
  const [infoLoading, setInfoLoading] = useState(false)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [infoSuccess, setInfoSuccess] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState('members')

  const [members, setMembers] = useState<MemberWithProfile[]>(initialMembers)
  const [roleChangingIds, setRoleChangingIds] = useState<Set<string>>(new Set())
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [globalError, setGlobalError] = useState<string | null>(null)

  // 社内メンバー招待フォーム
  const [internalEmail, setInternalEmail] = useState('')
  const [internalEmails, setInternalEmails] = useState<{ name: string; email: string }[]>([])
  const [internalRole, setInternalRole] = useState<UserRole>('viewer')
  const [internalInviting, setInternalInviting] = useState(false)
  const [internalError, setInternalError] = useState<string | null>(null)
  const [internalResults, setInternalResults] = useState<{ email: string; success: boolean; message: string }[]>([])

  // コンタクトサジェスト
  const [contactSuggestions, setContactSuggestions] = useState<{ name: string; email: string; department: string }[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ベンダー招待フォーム
  const [vendorEmail, setVendorEmail] = useState('')
  const [vendorPhaseIds, setVendorPhaseIds] = useState<Set<string>>(new Set())
  const [vendorInviting, setVendorInviting] = useState(false)
  const [vendorError, setVendorError] = useState<string | null>(null)
  const [vendorSuccess, setVendorSuccess] = useState<string | null>(null)

  const updateTask = useTaskStore((s) => s.updateTask)
  const setStoreMembers = useProjectStore((s) => s.setMembers)

  const vendorMembers = members.filter((m) => m.role === 'vendor')

  async function handleInternalInvite() {
    // Build the list of targets: chips take priority; fall back to typed text
    const targets: { name: string; email: string }[] =
      internalEmails.length > 0
        ? internalEmails
        : internalEmail.trim()
          ? [{ name: internalEmail.trim(), email: internalEmail.trim() }]
          : []
    if (targets.length === 0) return

    setInternalInviting(true)
    setInternalError(null)
    setInternalResults([])

    const results: { email: string; success: boolean; message: string }[] = []
    for (const target of targets) {
      try {
        const res = await fetch('/api/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: project.id,
            email: target.email,
            role: internalRole,
          }),
        })
        const json = await res.json() as { error?: string; data?: unknown }
        if (!res.ok) throw new Error(json.error ?? '招待に失敗しました')
        results.push({ email: target.email, success: true, message: '招待しました' })
      } catch (err) {
        results.push({
          email: target.email,
          success: false,
          message: err instanceof Error ? err.message : '招待に失敗しました',
        })
      }
    }

    setInternalResults(results)
    setInternalEmails([])
    setInternalEmail('')
    setInternalInviting(false)
  }

  function handleVendorPhaseToggle(phaseId: string) {
    setVendorPhaseIds((prev) => {
      const next = new Set(prev)
      if (next.has(phaseId)) {
        next.delete(phaseId)
      } else {
        next.add(phaseId)
      }
      return next
    })
  }

  async function handleVendorInvite() {
    if (!vendorEmail.trim()) return
    setVendorInviting(true)
    setVendorError(null)
    setVendorSuccess(null)
    try {
      // まずベンダーとして招待（RPC が vendor_phase_ids を '{}' で初期化する）
      const postRes = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          email: vendorEmail.trim(),
          role: 'vendor',
        }),
      })
      const postJson = await postRes.json() as { error?: string; data?: unknown }
      if (!postRes.ok) throw new Error(
        (postJson.error) ?? '招待に失敗しました'
      )

      // 選択済みのフェーズIDがあれば担当スコープを設定する
      const selectedIds = Array.from(vendorPhaseIds)
      const memberId =
        postJson.data !== null &&
        typeof postJson.data === 'object' &&
        'member_id' in postJson.data &&
        typeof (postJson.data as Record<string, unknown>).member_id === 'string'
          ? (postJson.data as Record<string, unknown>).member_id as string
          : null
      if (selectedIds.length > 0 && memberId) {
        const patchRes = await fetch('/api/members', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: memberId,
            vendor_phase_ids: selectedIds,
          }),
        })
        const patchJson = await patchRes.json() as { error?: string }
        if (!patchRes.ok) throw new Error(patchJson.error ?? 'フェーズスコープの設定に失敗しました')
      }

      setVendorEmail('')
      setVendorPhaseIds(new Set())
      setVendorSuccess('ベンダーを招待しました')
    } catch (err) {
      console.error('Vendor invite failed:', err)
      setVendorError(err instanceof Error ? err.message : '招待に失敗しました')
    } finally {
      setVendorInviting(false)
    }
  }

  async function handleRoleChange(memberId: string, newRole: UserRole) {
    // Capture the current role before optimistic update so we can revert accurately
    // even in long-lived sessions where initialMembers may be stale
    const previousRole = members.find((m) => m.id === memberId)?.role
    if (!previousRole) return

    setRoleChangingIds((prev) => new Set(prev).add(memberId))
    setGlobalError(null)
    // Optimistic update
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    )
    try {
      const res = await fetch('/api/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: memberId, role: newRole }),
      })
      const json = await res.json() as { error?: string; data?: MemberWithProfile }
      if (!res.ok) throw new Error(json.error ?? 'ロール変更に失敗しました')
      if (json.data) {
        setMembers((prev) =>
          prev.map((m) => (m.id === memberId ? { ...m, ...json.data } : m))
        )
      }
    } catch (err) {
      console.error('Role change failed:', err)
      setGlobalError(err instanceof Error ? err.message : 'ロール変更に失敗しました')
      // Revert to the role that was current at the time of this call, not the initial prop value
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: previousRole } : m))
      )
    } finally {
      setRoleChangingIds((prev) => {
        const next = new Set(prev)
        next.delete(memberId)
        return next
      })
    }
  }

  async function handleDelete(memberId: string) {
    if (!window.confirm('このメンバーを削除してもよいですか？')) return
    setDeletingIds((prev) => new Set(prev).add(memberId))
    setGlobalError(null)
    // Optimistic
    const prevMembers = members
    setMembers((prev) => prev.filter((m) => m.id !== memberId))
    try {
      const res = await fetch(`/api/members?memberId=${memberId}`, {
        method: 'DELETE',
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'メンバー削除に失敗しました')
    } catch (err) {
      console.error('Delete failed:', err)
      setGlobalError(err instanceof Error ? err.message : 'メンバー削除に失敗しました')
      setMembers(prevMembers)
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(memberId)
        return next
      })
    }
  }

  async function handleScopeChange(memberId: string, phaseIds: string[]) {
    const res = await fetch('/api/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: memberId, vendor_phase_ids: phaseIds }),
    })
    const json = await res.json() as { error?: string; data?: MemberWithProfile }
    if (!res.ok) throw new Error(json.error ?? 'スコープ更新に失敗しました')
    // API 成功後は常にローカルステートとストアを同期する
    const updated = members.map((m) =>
      m.id === memberId
        ? { ...m, ...(json.data ?? {}), vendor_phase_ids: phaseIds }
        : m
    )
    setMembers(updated)
    setStoreMembers(updated)
  }

  async function handleInfoSave() {
    if (!infoName.trim()) {
      setInfoError('プロジェクト名は必須です')
      return
    }
    setInfoLoading(true)
    setInfoError(null)
    setInfoSuccess(null)
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: infoName.trim(),
          description: infoDescription || null,
          color: infoColor,
          client_name: infoClientName || null,
          project_number: infoProjectNumber || null,
          start_date: infoStartDate || null,
          end_date: infoEndDate || null,
        }),
      })
      const json = await res.json() as { error?: string; data?: Project }
      if (!res.ok) throw new Error(json.error ?? '保存に失敗しました')
      if (json.data) {
        setInfoName(json.data.name)
        setInfoDescription(json.data.description ?? '')
        setInfoColor(json.data.color)
        setInfoClientName(json.data.client_name ?? '')
        setInfoProjectNumber(json.data.project_number ?? '')
        setInfoStartDate(json.data.start_date ?? '')
        setInfoEndDate(json.data.end_date ?? '')
      }
      setInfoSuccess('保存しました')
      router.refresh()
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setInfoLoading(false)
    }
  }

  async function handleVendorAssign(taskId: string, vendorId: string | null) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    // Optimistic update to store
    updateTask(taskId, { vendor_id: vendorId })
    const res = await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, vendor_id: vendorId, version: task.version }),
    })
    const json = await res.json() as { error?: string; data?: Task }
    if (!res.ok) {
      // Revert
      updateTask(taskId, { vendor_id: task.vendor_id })
      throw new Error(json.error ?? 'ベンダー割当に失敗しました')
    }
    if (json.data) {
      updateTask(taskId, json.data)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            ← 戻る
          </Button>
          <h1 className="text-xl font-semibold">{project.name} — 設定</h1>
        </div>
        {activeTab === 'info' && (
          <Button onClick={handleInfoSave} disabled={infoLoading}>
            {infoLoading ? '保存中...' : '保存'}
          </Button>
        )}
      </div>

      {globalError && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {globalError}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">基本情報</TabsTrigger>
          <TabsTrigger value="members">メンバー管理</TabsTrigger>
          {permissions.canManageMembers && (
            <TabsTrigger value="vendors">ベンダー管理</TabsTrigger>
          )}
        </TabsList>

        {/* 基本情報タブ */}
        <TabsContent value="info">
          <div className="space-y-4 mt-4 max-w-lg">
            <div className="space-y-1.5">
              <Label htmlFor="info-name">プロジェクト名 *</Label>
              <Input
                id="info-name"
                value={infoName}
                onChange={(e) => setInfoName(e.target.value)}
                placeholder="プロジェクト名"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="info-description">説明</Label>
              <Input
                id="info-description"
                value={infoDescription}
                onChange={(e) => setInfoDescription(e.target.value)}
                placeholder="説明（任意）"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="info-color">カラー</Label>
              <input
                id="info-color"
                type="color"
                value={infoColor}
                onChange={(e) => setInfoColor(e.target.value)}
                className="h-8 w-16 cursor-pointer rounded border border-input bg-transparent p-0.5"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="info-client-name">クライアント名</Label>
              <Input
                id="info-client-name"
                value={infoClientName}
                onChange={(e) => setInfoClientName(e.target.value)}
                placeholder="クライアント名（任意）"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="info-project-number">プロジェクト番号</Label>
              <Input
                id="info-project-number"
                value={infoProjectNumber}
                onChange={(e) => setInfoProjectNumber(e.target.value)}
                placeholder="プロジェクト番号（任意）"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="info-start-date">開始日</Label>
                <Input
                  id="info-start-date"
                  type="date"
                  value={infoStartDate}
                  onChange={(e) => setInfoStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="info-end-date">終了日</Label>
                <Input
                  id="info-end-date"
                  type="date"
                  value={infoEndDate}
                  min={infoStartDate || undefined}
                  onChange={(e) => setInfoEndDate(e.target.value)}
                />
              </div>
            </div>
            {infoError && (
              <p className="text-sm text-destructive">{infoError}</p>
            )}
            {infoSuccess && (
              <p className="text-sm text-green-600">{infoSuccess}</p>
            )}
            <Button onClick={handleInfoSave} disabled={infoLoading}>
              {infoLoading ? '保存中...' : '保存'}
            </Button>
          </div>
        </TabsContent>

        {/* メンバー管理タブ */}
        <TabsContent value="members">
          <div className="space-y-6 mt-4">
            {/* メンバー一覧 */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">名前</th>
                    <th className="text-left p-3 font-medium">メール</th>
                    <th className="text-left p-3 font-medium">ロール</th>
                    <th className="text-left p-3 font-medium">参加日</th>
                    {permissions.canManageMembers && (
                      <th className="text-left p-3 font-medium">操作</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-t">
                      <td className="p-3">
                        {member.profiles?.display_name ?? '—'}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {member.profiles?.email ?? '—'}
                      </td>
                      <td className="p-3">
                        {permissions.canManageMembers && member.user_id !== currentUserId ? (
                          <Select
                            value={member.role}
                            onValueChange={(v) => handleRoleChange(member.id, v as UserRole)}
                            disabled={roleChangingIds.has(member.id)}
                          >
                            <SelectTrigger size="sm" className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CHANGEABLE_ROLES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {ROLE_LABELS[role]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
                        )}
                        {/* ベンダー行に担当フェーズ数を表示する */}
                        {member.role === 'vendor' && (
                          <p className="text-xs text-muted-foreground mt-1">
                            担当フェーズ数: {member.vendor_phase_ids?.length ?? 0}件
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(member.joined_at).toLocaleDateString('ja-JP')}
                      </td>
                      {permissions.canManageMembers && (
                        <td className="p-3">
                          {member.user_id !== currentUserId && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(member.id)}
                              disabled={deletingIds.has(member.id)}
                            >
                              削除
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 招待フォーム（オーナーのみ） */}
            {permissions.canManageMembers && (
              <div className="space-y-4">
                {/* 社内メンバー招待 */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-medium text-sm">社内メンバー招待</h3>
                  <div className="flex gap-2 items-start">
                    {/* Chip + input container */}
                    <div className="flex-1 relative">
                      <div className="border rounded-md px-2 py-1.5 flex flex-wrap gap-1 items-center min-h-10 focus-within:ring-2 focus-within:ring-ring">
                        {internalEmails.map((contact, i) => (
                          <span
                            key={i}
                            className="bg-indigo-100 text-indigo-800 text-sm rounded px-2 py-0.5 flex items-center gap-1"
                          >
                            {contact.name}
                            <button
                              type="button"
                              className="text-indigo-400 hover:text-indigo-700"
                              onClick={() =>
                                setInternalEmails((prev) => prev.filter((_, idx) => idx !== i))
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <Input
                          type="text"
                          placeholder={internalEmails.length === 0 ? '名前またはメールアドレス' : ''}
                          value={internalEmail}
                          className="border-0 shadow-none focus-visible:ring-0 p-0 h-auto flex-1 min-w-32 text-sm"
                          onChange={(e) => {
                            const value = e.target.value
                            setInternalEmail(value)
                            if (debounceRef.current) clearTimeout(debounceRef.current)
                            if (value.length >= 2) {
                              debounceRef.current = setTimeout(async () => {
                                try {
                                  const res = await fetch(`/api/contacts?q=${encodeURIComponent(value)}`)
                                  if (res.ok) {
                                    const data = await res.json()
                                    setContactSuggestions(data)
                                    setShowSuggestions(true)
                                  }
                                } catch {
                                  // ignore fetch errors
                                }
                              }, 300)
                            } else {
                              setContactSuggestions([])
                              setShowSuggestions(false)
                            }
                          }}
                          onBlur={() => {
                            setTimeout(() => setShowSuggestions(false), 300)
                          }}
                        />
                      </div>
                      {showSuggestions && contactSuggestions.length > 0 && (
                        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border rounded-md shadow-md max-h-60 overflow-y-auto" onMouseDown={(e) => e.preventDefault()}>
                          {contactSuggestions.map((c, i) => (
                            <button
                              key={i}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setInternalEmails((prev) => [
                                  ...prev,
                                  { name: c.name || c.email, email: c.email },
                                ])
                                setInternalEmail('')
                                setContactSuggestions([])
                                setShowSuggestions(false)
                              }}
                            >
                              <div className="text-sm">
                                <span className="font-medium">{c.name}</span>
                                {c.department && (
                                  <span className="text-muted-foreground ml-2 text-xs">{c.department}</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{c.email}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Select
                      value={internalRole}
                      onValueChange={(v) => setInternalRole(v as UserRole)}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INTERNAL_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleInternalInvite}
                      disabled={internalInviting || (internalEmails.length === 0 && !internalEmail.trim())}
                    >
                      {internalInviting ? '送信中...' : '招待'}
                    </Button>
                  </div>
                  {internalError && (
                    <p className="text-sm text-destructive">{internalError}</p>
                  )}
                  {internalResults.length > 0 && (
                    <div className="space-y-1">
                      {internalResults.length === 1 && internalResults[0].success ? (
                        <p className="text-sm text-green-600">招待メールを送信しました</p>
                      ) : internalResults.every((r) => r.success) ? (
                        <p className="text-sm text-green-600">{internalResults.length}名を招待しました</p>
                      ) : (
                        internalResults.map((r, i) => (
                          <p key={i} className={`text-sm ${r.success ? 'text-green-600' : 'text-destructive'}`}>
                            {r.email}: {r.message}
                          </p>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* ベンダー招待 */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-medium text-sm">ベンダー招待</h3>
                  {phases.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      先にフェーズを追加してください
                    </p>
                  ) : (
                    <>
                      <div className="flex gap-2 items-start">
                        <div className="flex-1">
                          <Input
                            type="email"
                            placeholder="メールアドレス"
                            value={vendorEmail}
                            onChange={(e) => setVendorEmail(e.target.value)}
                          />
                        </div>
                        <Button
                          onClick={handleVendorInvite}
                          disabled={vendorInviting || !vendorEmail.trim()}
                        >
                          {vendorInviting ? '送信中...' : '招待'}
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground font-medium">
                          担当フェーズを選択（後から変更可能）
                        </p>
                        <ScrollArea className="max-h-48 border rounded-md p-2">
                          <div className="space-y-2 p-1">
                            {phases.map((phase) => (
                              <div key={phase.id} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`vendor-invite-phase-${phase.id}`}
                                  checked={vendorPhaseIds.has(phase.id)}
                                  onChange={() => handleVendorPhaseToggle(phase.id)}
                                  className="h-4 w-4 rounded border-gray-300"
                                />
                                <Label
                                  htmlFor={`vendor-invite-phase-${phase.id}`}
                                  className="font-normal cursor-pointer"
                                >
                                  {phase.name}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    </>
                  )}
                  {vendorError && (
                    <p className="text-sm text-destructive">{vendorError}</p>
                  )}
                  {vendorSuccess && (
                    <p className="text-sm text-green-600">{vendorSuccess}</p>
                  )}
                </div>
              </div>
            )}

            {/* ベンダーメンバーの担当フェーズ変更（オーナーのみ） */}
            {permissions.canManageMembers && vendorMembers.length > 0 && (
              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-sm">ベンダーの担当フェーズ変更</h3>
                {vendorMembers.map((member) => (
                  <div key={member.id} className="border-t pt-4 first:border-t-0 first:pt-0">
                    <VendorMemberTaskScope
                      member={member}
                      phases={phases}
                      onScopeChange={handleScopeChange}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ベンダー管理タブ */}
        {permissions.canManageMembers && (
          <TabsContent value="vendors">
            <div className="space-y-8 mt-4">
              {/* タスクへのベンダー割当 */}
              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="font-medium">タスクへのベンダー割当</h3>
                <VendorTaskAssignment
                  tasks={tasks}
                  vendorMembers={vendorMembers}
                  onAssign={handleVendorAssign}
                />
              </div>

              {/* ベンダーメンバーの閲覧スコープ設定 */}
              <div className="border rounded-lg p-4 space-y-6">
                <h3 className="font-medium">ベンダーメンバーの閲覧スコープ</h3>
                {vendorMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    ベンダーメンバーがいません
                  </p>
                ) : (
                  vendorMembers.map((member) => (
                    <div key={member.id} className="border-t pt-4 first:border-t-0 first:pt-0">
                      <VendorMemberTaskScope
                        member={member}
                        phases={phases}
                        onScopeChange={handleScopeChange}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

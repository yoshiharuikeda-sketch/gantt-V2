'use client'

import { useRouter } from 'next/navigation'
import { User, LogOut } from 'lucide-react'
import { useSignOut } from '@/hooks/useSignOut'
import { useProjectStore } from '@/store/projectStore'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu'
import { NotificationBell } from '@/components/ui/NotificationBell'

export function Header() {
  const router = useRouter()
  const handleSignOut = useSignOut()
  const currentProject = useProjectStore((s) => s.currentProject)

  return (
    <header
      className="flex items-center justify-between px-6 h-[52px] shrink-0 bg-white border-b border-slate-200"
    >
      <div className="text-sm font-semibold text-slate-800">
        {currentProject ? currentProject.name : 'プロジェクトを選択'}
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center justify-center size-8 rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors outline-none"
            aria-label="ユーザーメニューを開く"
          >
            <User className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom">
            <DropdownMenuGroup>
              <DropdownMenuLabel>アカウント</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => router.push('/profile')}
              >
                <User className="size-4" />
                プロフィール
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onClick={handleSignOut}
              >
                <LogOut className="size-4" />
                ログアウト
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

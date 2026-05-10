'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSignOut } from '@/hooks/useSignOut'
import { useProjectStore } from '@/store/projectStore'
import { cn } from '@/lib/utils'
import type { Project } from '@/types/database'

const STORAGE_KEY = 'sidebar-open'

export function Sidebar() {
  const router = useRouter()
  const handleSignOut = useSignOut()
  const projects = useProjectStore((s) => s.projects)
  const currentProject = useProjectStore((s) => s.currentProject)
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject)

  // Start closed; hydrate from localStorage on mount to avoid SSR mismatch
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    // Default is closed, so only open if explicitly stored as 'true'
    if (stored === 'true') {
      setIsOpen(true)
    }
  }, [])

  function toggle() {
    setIsOpen((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  function handleProjectClick(project: Project) {
    setCurrentProject(project)
    router.push(`/projects/${project.id}`)
  }

  return (
    <>
      {/* Toggle button — always visible at the left edge */}
      <button
        onClick={toggle}
        aria-label={isOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'}
        className={cn(
          'fixed top-4 z-50 flex items-center justify-center w-6 h-8 rounded-r-md bg-slate-700 text-white shadow-md transition-[left] duration-300 hover:bg-slate-600',
          isOpen ? 'left-60' : 'left-0'
        )}
      >
        {isOpen ? (
          <ChevronLeft className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
      </button>

      {/* Sidebar panel */}
      <aside
        className={cn(
          'flex flex-col shrink-0 h-screen bg-slate-900 overflow-hidden transition-[width] duration-300',
          isOpen ? 'w-60' : 'w-0'
        )}
      >
        {/* ロゴ */}
        <div className="px-5 py-5 border-b border-white/10 shrink-0">
          <Link href="/" className="text-white font-bold text-lg tracking-tight whitespace-nowrap">
            GanttV2
          </Link>
        </div>

        {/* プロジェクト一覧 */}
        <nav className="flex-1 overflow-y-auto py-4 min-w-60">
          <p className="px-5 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
            プロジェクト
          </p>
          {projects.length === 0 ? (
            <p className="px-5 text-sm text-slate-500 whitespace-nowrap">プロジェクトなし</p>
          ) : (
            <ul>
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    onClick={() => handleProjectClick(project)}
                    className={cn(
                      'w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left transition-colors',
                      currentProject?.id === project.id
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    )}
                  >
                    {/* Project color dot as icon */}
                    <span
                      className="size-3 rounded-full shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="truncate">{project.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

        </nav>

        {/* ログアウトボタン */}
        <div className="px-4 py-4 border-t border-white/10 shrink-0 min-w-60">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <LogOut className="size-4 shrink-0" />
            <span className="whitespace-nowrap">ログアウト</span>
          </button>
        </div>
      </aside>
    </>
  )
}

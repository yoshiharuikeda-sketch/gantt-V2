'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectStore } from '@/store/projectStore'
import { Badge } from '@/components/ui/badge'
import type { Project, ProjectStatus } from '@/types/database'

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: '進行中',
  completed: '完了',
  archived: 'アーカイブ',
}

const STATUS_VARIANTS: Record<
  ProjectStatus,
  'default' | 'secondary' | 'outline'
> = {
  active: 'default',
  completed: 'secondary',
  archived: 'outline',
}

interface ProjectListProps {
  projects: Project[]
}

export function ProjectList({ projects }: ProjectListProps) {
  const router = useRouter()
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject)
  const setProjects = useProjectStore((s) => s.setProjects)

  // サーバーから受け取ったプロジェクトをマウント時にストアへ同期する
  useEffect(() => {
    setProjects(projects)
  }, [projects, setProjects])

  function handleClick(project: Project) {
    setCurrentProject(project)
    router.push(`/projects/${project.id}`)
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-sm">プロジェクトがまだありません。</p>
        <p className="text-sm mt-1">「新規プロジェクト作成」から始めてください。</p>
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <li key={project.id}>
          <button
            onClick={() => handleClick(project)}
            className="w-full text-left rounded-xl border border-slate-200 bg-white p-5 hover:shadow-md hover:border-indigo-300 transition-all group"
          >
            {/* カラーバー */}
            <div
              className="h-1 w-12 rounded-full mb-4"
              style={{ backgroundColor: project.color || '#6366F1' }}
            />

            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors line-clamp-2">
                {project.name}
              </h3>
              <Badge variant={STATUS_VARIANTS[project.status]}>
                {STATUS_LABELS[project.status]}
              </Badge>
            </div>

            {project.client_name && (
              <p className="mt-2 text-xs text-slate-500 truncate">
                クライアント: {project.client_name}
              </p>
            )}

            {project.project_number && (
              <p className="mt-1 text-xs text-slate-400">
                #{project.project_number}
              </p>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

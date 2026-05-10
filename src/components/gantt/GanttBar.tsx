'use client'

import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { getBarX, getBarWidth } from '@/lib/ganttUtils'
import { format, parseISO } from '@/lib/utils/dateUtils'
import { useProjectStore } from '@/store/projectStore'
import { canVendorEditTask } from '@/types/rbac'
import type { TaskWithBaseline, UserPermissions } from '@/types'
import type { Task } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  not_started: '#94a3b8',
  in_progress: '#6366f1',
  completed: '#22c55e',
  blocked: '#ef4444',
}

interface GanttBarProps {
  task: TaskWithBaseline
  timelineStart: Date
  dayWidth: number
  rowHeight: number
  displayStart: string
  displayEnd: string
  isDragging: boolean
  permissions: UserPermissions | null
  onDragStart: (e: React.MouseEvent, task: Task, mode: 'move' | 'resize-left' | 'resize-right') => void
}

export function GanttBar({
  task,
  timelineStart,
  dayWidth,
  rowHeight,
  displayStart,
  displayEnd,
  isDragging,
  permissions,
  onDragStart,
}: GanttBarProps) {
  const currentUserId = useProjectStore((s) => s.currentUserId)
  const canEdit = permissions !== null && currentUserId !== null
    ? canVendorEditTask(permissions, task.vendor_id ?? null, currentUserId)
    : (permissions?.canEdit ?? false)
  const barColor = STATUS_COLORS[task.status] ?? '#94a3b8'

  const x = getBarX(displayStart, timelineStart, dayWidth)
  const width = Math.max(getBarWidth(displayStart, displayEnd, dayWidth), dayWidth)
  const top = rowHeight * 0.2
  const height = rowHeight * 0.6

  const fmtDate = (d: string | null) => d ? format(parseISO(d), 'yyyy/MM/dd') : '-'

  const hasBaseline = Boolean(task.baseline?.start_date && task.baseline?.end_date)
  const baselineX = hasBaseline
    ? getBarX(task.baseline!.start_date!, timelineStart, dayWidth)
    : 0
  const baselineWidth = hasBaseline
    ? getBarWidth(task.baseline!.start_date!, task.baseline!.end_date!, dayWidth)
    : 0

  return (
    <>
      {/* Baseline ghost bar — rendered behind the main bar */}
      {hasBaseline && (
        <div
          className="absolute rounded pointer-events-none"
          style={{
            left: baselineX,
            top,
            width: baselineWidth,
            height,
            backgroundColor: barColor,
            opacity: 0.4,
            border: `1px dashed ${barColor}`,
            zIndex: 1,
          }}
        />
      )}

      {/* Main bar */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                className={`absolute rounded group ${
                  canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                } hover:brightness-110 ${isDragging ? 'opacity-80 z-20' : ''}`}
                style={{
                  left: x,
                  top,
                  width,
                  height,
                  backgroundColor: barColor + '33',
                  border: `1.5px solid ${barColor}`,
                  transition: isDragging ? 'none' : undefined,
                  zIndex: 2,
                }}
                onMouseDown={canEdit ? (e) => onDragStart(e, task, 'move') : undefined}
              />
            }
          >
            {/* Resize handle left */}
            {canEdit && (
              <div
                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
                onMouseDown={(e) => { e.stopPropagation(); onDragStart(e, task, 'resize-left') }}
              />
            )}

            {/* Progress fill */}
            <div
              className="absolute left-0 top-0 bottom-0 rounded-sm pointer-events-none"
              style={{ width: `${task.progress}%`, backgroundColor: barColor + '88' }}
            />

            {/* Label */}
            {width > 40 && (
              <span
                className="absolute inset-0 flex items-center px-1.5 text-xs font-medium truncate pointer-events-none"
                style={{ color: barColor }}
              >
                {task.progress > 0 && `${task.progress}% `}{task.name}
              </span>
            )}

            {/* Resize handle right */}
            {canEdit && (
              <div
                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
                onMouseDown={(e) => { e.stopPropagation(); onDragStart(e, task, 'resize-right') }}
              />
            )}
          </TooltipTrigger>
          <TooltipContent side="top">
            <div className="text-xs space-y-0.5">
              <p className="font-semibold">{task.name}</p>
              <p>{fmtDate(displayStart)} → {fmtDate(displayEnd)}</p>
              <p>進捗: {task.progress}%</p>
              {hasBaseline && (
                <p className="text-muted-foreground">
                  基準: {fmtDate(task.baseline!.start_date)} → {fmtDate(task.baseline!.end_date)}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  )
}

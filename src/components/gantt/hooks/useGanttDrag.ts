import { useCallback, useRef, useState } from 'react'
import { addDays, toDateString } from '@/lib/utils/dateUtils'
import { useTaskStore } from '@/store/taskStore'
import type { Task, UserPermissions } from '@/types'

type DragState = {
  taskId: string
  mode: 'move' | 'resize-left' | 'resize-right'
  startMouseX: number
  originalStartDate: string
  originalEndDate: string
  currentStartDate: string
  currentEndDate: string
}

export function useGanttDrag(
  timelineStart: Date,
  dayWidth: number,
  permissions: UserPermissions | null
) {
  const { tasks, upsertTask } = useTaskStore()
  const dragRef = useRef<DragState | null>(null)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [ghostDates, setGhostDates] = useState<{ start: string; end: string } | null>(null)
  const prevGhostDatesRef = useRef<{ start: string; end: string } | null>(null)

  const canEdit = permissions?.canEdit ?? false

  const onMouseDown = useCallback(
    (e: React.MouseEvent, task: Task, mode: 'move' | 'resize-left' | 'resize-right') => {
      if (!canEdit || !task.start_date || !task.end_date) return
      e.preventDefault()
      e.stopPropagation()

      dragRef.current = {
        taskId: task.id,
        mode,
        startMouseX: e.clientX,
        originalStartDate: task.start_date,
        originalEndDate: task.end_date,
        currentStartDate: task.start_date,
        currentEndDate: task.end_date,
      }
      setDraggingTaskId(task.id)
      setGhostDates({ start: task.start_date, end: task.end_date })
    },
    [canEdit]
  )

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startMouseX
      const daysDelta = Math.round(dx / dayWidth)

      const origStart = new Date(dragRef.current.originalStartDate)
      const origEnd = new Date(dragRef.current.originalEndDate)

      let newStart = dragRef.current.currentStartDate
      let newEnd = dragRef.current.currentEndDate

      if (dragRef.current.mode === 'move') {
        newStart = toDateString(addDays(origStart, daysDelta))
        newEnd = toDateString(addDays(origEnd, daysDelta))
      } else if (dragRef.current.mode === 'resize-right') {
        const candidate = addDays(origEnd, daysDelta)
        if (candidate > origStart) newEnd = toDateString(candidate)
      } else if (dragRef.current.mode === 'resize-left') {
        const candidate = addDays(origStart, daysDelta)
        if (candidate < origEnd) newStart = toDateString(candidate)
      }

      dragRef.current.currentStartDate = newStart
      dragRef.current.currentEndDate = newEnd
      const prev = prevGhostDatesRef.current
      if (!prev || prev.start !== newStart || prev.end !== newEnd) {
        const next = { start: newStart, end: newEnd }
        prevGhostDatesRef.current = next
        setGhostDates(next)
      }
    },
    [dayWidth]
  )

  const onMouseUp = useCallback(async () => {
    if (!dragRef.current) return
    const { taskId, currentStartDate, currentEndDate, originalStartDate, originalEndDate } =
      dragRef.current

    dragRef.current = null
    prevGhostDatesRef.current = null
    setDraggingTaskId(null)
    setGhostDates(null)

    if (currentStartDate === originalStartDate && currentEndDate === originalEndDate) return

    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    upsertTask({ ...task, start_date: currentStartDate, end_date: currentEndDate })

    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          start_date: currentStartDate,
          end_date: currentEndDate,
          version: task.version,
        }),
      })

      if (!res.ok) {
        upsertTask(task)
        const data = await res.json() as { error?: string }
        console.error('日付更新エラー:', data.error)
      } else {
        const updated = await res.json() as Task
        upsertTask(updated)
      }
    } catch {
      upsertTask(task)
    }
  }, [tasks, upsertTask])

  return { draggingTaskId, ghostDates, onMouseDown, onMouseMove, onMouseUp }
}

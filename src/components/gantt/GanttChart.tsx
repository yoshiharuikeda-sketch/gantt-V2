'use client'

import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Undo2, Redo2 } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'
import { useProjectStore } from '@/store/projectStore'
import { useTaskStore } from '@/store/taskStore'
import { DAY_WIDTH_MAP, getBarX, getTimelineRange } from '@/lib/ganttUtils'
import { differenceInDays, addDays } from '@/lib/utils/dateUtils'
import { eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, isToday } from 'date-fns'
import { useGanttDrag } from './hooks/useGanttDrag'
import { useBaselineOverlay } from './hooks/useBaselineOverlay'
import { GanttHeader } from './GanttHeader'
import { GanttBar } from './GanttBar'
import { GanttLeftPanel } from './GanttLeftPanel'
import { BaselineToggle } from './BaselineToggle'
import { useVendorFilter } from '@/hooks/useVendorFilter'
import { useUndoRedo } from '@/hooks/useUndoRedo'
import type { ZoomLevel, TaskWithBaseline } from '@/types'

const ROW_HEIGHT = 40
// Default width accommodates all columns (WBS col 36 + sum of default column widths)
const INITIAL_LEFT_PANEL_WIDTH = 666
const MIN_LEFT_PANEL_WIDTH = 200
const MAX_LEFT_PANEL_WIDTH = 900
const MIN_ROWS = 30

/**
 * Build a map from taskId → visual row index, accounting for phase header rows.
 * This must mirror the row-building logic in GanttLeftPanel so bar positions align.
 * collapsedPhaseIds: phases whose task rows are hidden (tasks are skipped in the map).
 */
function buildTaskRowMap(
  tasks: TaskWithBaseline[],
  phases: { id: string; display_order: number }[],
  collapsedPhaseIds: Set<string>,
): Map<string, number> {
  const sortedPhases = [...phases].sort((a, b) => a.display_order - b.display_order)
  const rowMap = new Map<string, number>()
  let row = 0

  for (const phase of sortedPhases) {
    const phaseTasks = tasks.filter((t) => t.phase_id === phase.id)
    row++ // phase header row
    if (!collapsedPhaseIds.has(phase.id)) {
      for (const task of phaseTasks) {
        rowMap.set(task.id, row)
        row++
      }
    }
  }

  const unassigned = tasks.filter((t) => t.phase_id === null)
  if (unassigned.length > 0) {
    row++ // unassigned phase header row
    if (!collapsedPhaseIds.has('__unassigned__')) {
      for (const task of unassigned) {
        rowMap.set(task.id, row)
        row++
      }
    }
  }

  return rowMap
}

export function GanttChart() {
  const filteredTasks = useVendorFilter()
  const zoomLevel = useUiStore((s) => s.zoomLevel)
  const ganttColumns = useUiStore((s) => s.ganttColumns)
  const setZoomLevel = useUiStore((s) => s.setZoomLevel)
  const collapsedPhaseIds = useUiStore((s) => s.collapsedPhaseIds)
  const permissions = useProjectStore((s) => s.permissions)
  const currentProject = useProjectStore((s) => s.currentProject)
  const phases = useTaskStore((s) => s.phases)
  const upsertPhase = useTaskStore((s) => s.upsertPhase)
  const upsertTask = useTaskStore((s) => s.upsertTask)
  const removeTask = useTaskStore((s) => s.removeTask)
  const storeTasks = useTaskStore((s) => s.tasks)

  // activeCellRef is set by GanttLeftPanel; we hold a ref here so the useUndoRedo
  // isEditing check can read it without stale closures.
  const activeCellRef = useRef(false)
  const { pushCommand, undo, redo, canUndo, canRedo } = useUndoRedo(() => activeCellRef.current)

  const tasksWithBaseline = useBaselineOverlay()

  const scrollRef = useRef<HTMLDivElement>(null)
  const leftScrollRef = useRef<HTMLDivElement>(null)

  // Panel resize state – persisted to localStorage
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return INITIAL_LEFT_PANEL_WIDTH
    const stored = localStorage.getItem('gantt-left-panel-width')
    if (stored === null) return INITIAL_LEFT_PANEL_WIDTH
    const parsed = Number(stored)
    if (!Number.isFinite(parsed) || parsed < MIN_LEFT_PANEL_WIDTH || parsed > MAX_LEFT_PANEL_WIDTH) {
      return INITIAL_LEFT_PANEL_WIDTH
    }
    return parsed
  })
  const isDraggingPanel = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  const [selectedTaskIdForConversion, setSelectedTaskIdForConversion] = useState<string | null>(null)

  const convertTaskToPhase = useCallback(async (taskId: string) => {
    const task = storeTasks.find((t) => t.id === taskId)
    if (!task || !currentProject) return

    // Optimistic delete
    removeTask(taskId)
    setSelectedTaskIdForConversion(null)

    // Create phase
    const phaseRes = await fetch('/api/phases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: currentProject.id,
        name: task.name,
        display_order: phases.length,
        color: '#6366F1',
        start_date: null,
        end_date: null,
      }),
    })
    if (!phaseRes.ok) { upsertTask(task); return }
    const { data: newPhase } = await phaseRes.json() as { data: import('@/types').Phase }
    upsertPhase(newPhase)

    // Move child tasks to new phase
    const childTasks = storeTasks.filter((t) => t.parent_task_id === taskId)
    await Promise.all(childTasks.map(async (child) => {
      const updated = { ...child, phase_id: newPhase.id, parent_task_id: null }
      upsertTask(updated)
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: child.id, version: child.version, phase_id: newPhase.id, parent_task_id: null }),
      })
    }))

    // Delete original task
    await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' })
  }, [storeTasks, currentProject, phases, upsertPhase, upsertTask, removeTask])

  const onPanelDividerMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingPanel.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = leftWidth
    e.preventDefault()
  }, [leftWidth])

  // Persist panel width to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('gantt-left-panel-width', String(leftWidth))
  }, [leftWidth])

  const dayWidth = DAY_WIDTH_MAP[zoomLevel]
  const { start: timelineStart, end: timelineEnd } = useMemo(
    () => getTimelineRange(filteredTasks),
    [filteredTasks]
  )
  const totalDays = differenceInDays(timelineEnd, timelineStart) + 1
  const totalWidth = totalDays * dayWidth

  const { draggingTaskId, ghostDates, onMouseDown, onMouseMove, onMouseUp } = useGanttDrag(
    timelineStart,
    dayWidth,
    permissions
  )

  // Attach global mouse events for bar drag and panel resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      onMouseMove(e)
      if (isDraggingPanel.current) {
        const delta = e.clientX - dragStartX.current
        const next = Math.min(MAX_LEFT_PANEL_WIDTH, Math.max(MIN_LEFT_PANEL_WIDTH, dragStartWidth.current + delta))
        setLeftWidth(next)
      }
    }
    const handleMouseUp = () => {
      onMouseUp()
      isDraggingPanel.current = false
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  // Sync vertical scroll
  useEffect(() => {
    const right = scrollRef.current
    const left = leftScrollRef.current
    if (!right || !left) return

    const onRightScroll = () => { left.scrollTop = right.scrollTop }
    const onLeftScroll = () => { right.scrollTop = left.scrollTop }

    right.addEventListener('scroll', onRightScroll)
    left.addEventListener('scroll', onLeftScroll)
    return () => {
      right.removeEventListener('scroll', onRightScroll)
      left.removeEventListener('scroll', onLeftScroll)
    }
  }, [])

  // Scroll to today on mount
  useEffect(() => {
    if (!scrollRef.current) return
    const todayX = getBarX(new Date().toISOString().slice(0, 10), timelineStart, dayWidth)
    const centerOffset = scrollRef.current.clientWidth / 2
    scrollRef.current.scrollLeft = Math.max(0, todayX - centerOffset)
  }, [timelineStart, dayWidth])

  // Grid lines
  const gridColumns = useMemo(() => {
    if (zoomLevel === 'day') {
      return eachDayOfInterval({ start: timelineStart, end: timelineEnd }).map((d) => ({
        key: d.toISOString(),
        x: differenceInDays(d, timelineStart) * dayWidth,
        width: dayWidth,
        highlight: isToday(d),
      }))
    }
    if (zoomLevel === 'week') {
      return eachWeekOfInterval({ start: timelineStart, end: timelineEnd }, { weekStartsOn: 1 }).map((d) => ({
        key: d.toISOString(),
        x: differenceInDays(d, timelineStart) * dayWidth,
        width: dayWidth * 7,
        highlight: false,
      }))
    }
    return eachMonthOfInterval({ start: timelineStart, end: timelineEnd }).map((d) => ({
      key: d.toISOString(),
      x: differenceInDays(d, timelineStart) * dayWidth,
      width: dayWidth * 30,
      highlight: false,
    }))
  }, [zoomLevel, timelineStart, timelineEnd, dayWidth])

  const todayX = differenceInDays(new Date(), timelineStart) * dayWidth

  const displayRows = useMemo(() => {
    const filteredIds = new Set(filteredTasks.map((t) => t.id))
    const visibleTasks = tasksWithBaseline.filter((t) => filteredIds.has(t.id))
    const padCount = Math.max(0, MIN_ROWS - visibleTasks.length)
    return { tasks: visibleTasks, emptyCount: padCount }
  }, [tasksWithBaseline, filteredTasks])

  // Build a phase-aware row map so bar positions match the left panel layout.
  // Each phase header occupies one row, so task rows are offset accordingly.
  // collapsedPhaseIds mirrors the left panel's collapse state so bars are positioned correctly.
  const taskRowMap = useMemo(
    () => buildTaskRowMap(displayRows.tasks, phases, collapsedPhaseIds),
    [displayRows.tasks, phases, collapsedPhaseIds],
  )

  // Total visual rows = phase headers + visible task rows + empty padding rows
  // Collapsed phases contribute only their header row (tasks are hidden).
  const { phaseHeaderCount, visibleTaskCount } = useMemo(() => {
    let headerCount = phases.length
    const hasUnassigned = displayRows.tasks.some((t) => t.phase_id === null)
    if (hasUnassigned) headerCount++

    // Count tasks that belong to non-collapsed phases
    let visibleCount = 0
    for (const task of displayRows.tasks) {
      const phaseId = task.phase_id ?? '__unassigned__'
      if (!collapsedPhaseIds.has(phaseId)) visibleCount++
    }
    return { phaseHeaderCount: headerCount, visibleTaskCount: visibleCount }
  }, [phases, displayRows.tasks, collapsedPhaseIds])

  // emptyCount is recalculated based on visible task rows (collapsed tasks are hidden).
  const adjustedEmptyCount = Math.max(0, MIN_ROWS - visibleTaskCount)
  const totalRows = visibleTaskCount + adjustedEmptyCount + phaseHeaderCount
  const totalHeight = totalRows * ROW_HEIGHT

  const ZOOM_LEVELS: ZoomLevel[] = ['day', 'week', 'month']
  const ZOOM_LABELS: Record<ZoomLevel, string> = { day: '日', week: '週', month: '月' }

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <BaselineToggle />
          {permissions?.canEdit && (
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
              disabled={!selectedTaskIdForConversion}
              onClick={() => { if (selectedTaskIdForConversion) void convertTaskToPhase(selectedTaskIdForConversion) }}
              title="選択したタスクをフェーズに変換"
            >
              フェーズ化
            </Button>
          )}
          <Button
            variant="outline"
            size="xs"
            disabled={!canUndo}
            onClick={undo}
            title="元に戻す (Cmd+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={!canRedo}
            onClick={redo}
            title="やり直し (Cmd+Shift+Z)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          {ZOOM_LEVELS.map((z) => (
            <Button
              key={z}
              variant={zoomLevel === z ? 'default' : 'outline'}
              size="xs"
              onClick={() => setZoomLevel(z)}
            >
              {ZOOM_LABELS[z]}
            </Button>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div
          ref={leftScrollRef}
          className="flex-shrink-0 bg-white z-10 overflow-y-auto overflow-x-hidden"
          style={{ width: leftWidth, scrollbarWidth: 'none' }}
        >
          <GanttLeftPanel
            tasks={displayRows.tasks}
            rowHeight={ROW_HEIGHT}
            columns={ganttColumns}
            permissions={permissions}
            pushCommand={pushCommand}
            onEditingChange={(editing) => { activeCellRef.current = editing }}
            onSelectedRowChange={(id) => setSelectedTaskIdForConversion(id)}
          />
        </div>

        {/* Drag divider between left panel and timeline */}
        <div
          className="flex-shrink-0 border-l border-r border-slate-200 cursor-col-resize hover:bg-blue-100 active:bg-blue-200 transition-colors z-20"
          style={{ width: 5 }}
          onMouseDown={onPanelDividerMouseDown}
        />

        {/* Right panel: timeline */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ width: totalWidth, minWidth: totalWidth }}>
            {/* Sticky header */}
            <div className="sticky top-0 z-20">
              <GanttHeader
                timelineStart={timelineStart}
                totalDays={totalDays}
                dayWidth={dayWidth}
                zoomLevel={zoomLevel}
              />
            </div>

            {/* Body */}
            <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
              {/* Grid column lines */}
              {gridColumns.map((col) => (
                <div
                  key={col.key}
                  className={`absolute top-0 bottom-0 border-r ${
                    col.highlight ? 'border-blue-200 bg-blue-50/40' : 'border-slate-100'
                  }`}
                  style={{ left: col.x, width: col.width }}
                />
              ))}

              {/* Row backgrounds */}
              {Array.from({ length: totalRows }).map((_, i) => (
                <div
                  key={i}
                  className={`absolute left-0 right-0 border-b border-slate-100 ${
                    i % 2 === 0 ? 'bg-transparent' : 'bg-slate-50/50'
                  }`}
                  style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
                />
              ))}

              {/* Today line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-blue-400 z-10 pointer-events-none"
                style={{ left: todayX }}
              />

              {/* Task bars — one TooltipProvider for all bars to avoid per-bar provider overhead */}
              <TooltipProvider>
              {displayRows.tasks.map((task) => {
                if (!task.start_date || !task.end_date) return null

                const visualRow = taskRowMap.get(task.id)
                if (visualRow === undefined) return null

                const isDragging = draggingTaskId === task.id
                const displayStart = isDragging && ghostDates ? ghostDates.start : task.start_date
                const displayEnd = isDragging && ghostDates ? ghostDates.end : task.end_date

                return (
                  <div
                    key={task.id}
                    className="absolute left-0 right-0"
                    style={{ top: visualRow * ROW_HEIGHT, height: ROW_HEIGHT }}
                  >
                    <GanttBar
                      task={task}
                      timelineStart={timelineStart}
                      dayWidth={dayWidth}
                      rowHeight={ROW_HEIGHT}
                      displayStart={displayStart}
                      displayEnd={displayEnd}
                      isDragging={isDragging}
                      permissions={permissions}
                      onDragStart={onMouseDown}
                    />
                  </div>
                )
              })}
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GanttChart

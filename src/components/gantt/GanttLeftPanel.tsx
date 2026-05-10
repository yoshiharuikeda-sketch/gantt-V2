'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { format, parseISO } from '@/lib/utils/dateUtils'
import { useTaskStore } from '@/store/taskStore'
import { useProjectStore } from '@/store/projectStore'
import { canVendorEditTask } from '@/types/rbac'
import { TaskDetailModal } from '@/components/task/TaskDetailModal'
import type { TaskWithBaseline, GanttColKey, UserPermissions } from '@/types'
import type { Task, Phase } from '@/types'

const COL_DEFS: Record<GanttColKey, { label: string; width: number }> = {
  name:       { label: 'タスク名',   width: 180 },
  start_date: { label: '開始日',     width: 90  },
  end_date:   { label: '終了日',     width: 90  },
  progress:   { label: '進捗率',     width: 70  },
  vendor:     { label: 'ベンダー',   width: 100 },
  updated_at: { label: '更新日',     width: 100 },
}

// Columns that cannot be directly edited in the inline cell
const NON_EDITABLE_COLS = new Set<GanttColKey>(['vendor', 'updated_at'])

function fmtDate(val: string | null | undefined): string {
  if (!val) return '-'
  try { return format(parseISO(val), 'yyyy/MM/dd') } catch { return '-' }
}

// Returns the raw editable value for a task cell
function getRawValue(task: TaskWithBaseline, col: GanttColKey): string {
  switch (col) {
    case 'name':       return task.name
    case 'start_date': return task.start_date ?? ''
    case 'end_date':   return task.end_date ?? ''
    case 'progress':   return String(task.progress)
    default:           return ''
  }
}

function getDisplayValue(task: TaskWithBaseline, col: GanttColKey): string {
  switch (col) {
    case 'name':       return task.name
    case 'start_date': return fmtDate(task.start_date)
    case 'end_date':   return fmtDate(task.end_date)
    case 'progress':   return `${task.progress}%`
    case 'vendor':     return task.vendor?.display_name ?? ''
    case 'updated_at': return fmtDate(task.updated_at)
    default:           return ''
  }
}

// Identifies a cell within the grid
type CellId = { taskId: string; col: GanttColKey }

// When activeCell was opened by a printable key, we skip full-text-select on focus
type ActiveCell = CellId & { fromKey: boolean }

// Data held in the clipboard for copy/paste (row-level context menu)
type ClipboardData = Pick<Task, 'name' | 'status' | 'start_date' | 'end_date' | 'progress' | 'phase_id'>

interface GanttLeftPanelProps {
  tasks: TaskWithBaseline[]
  rowHeight: number
  columns: GanttColKey[]
  onTaskClick?: (taskId: string) => void
  permissions: UserPermissions | null
}

// ─── PhaseRow ─────────────────────────────────────────────────────────────────

interface PhaseRowProps {
  phase: Phase
  rowHeight: number
  columns: GanttColKey[]
}

function PhaseRow({ phase, rowHeight, columns }: PhaseRowProps) {
  const totalColWidth = columns.reduce((sum, key) => sum + COL_DEFS[key].width, 0)

  return (
    <div
      className="flex items-center border-b border-slate-200 bg-slate-100 select-none"
      style={{ height: rowHeight }}
    >
      {/* Phase color bar */}
      <div
        className="flex-shrink-0"
        style={{
          width: 4,
          height: '100%',
          backgroundColor: phase.color,
        }}
      />
      <div
        className="flex items-center overflow-hidden"
        style={{ width: totalColWidth, height: '100%', paddingLeft: 8, paddingRight: 8 }}
      >
        <span className="text-xs font-bold text-slate-700 truncate">{phase.name}</span>
      </div>
    </div>
  )
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: TaskWithBaseline
  rowHeight: number
  columns: GanttColKey[]
  rowIndex: number
  activeCell: ActiveCell | null
  selectedCell: CellId | null
  selectionRange: Set<string> | null
  editValue: string
  isSelected: boolean
  onEditValueChange: (v: string) => void
  onCellClick: (task: TaskWithBaseline, col: GanttColKey) => void
  onCellDoubleClick: (task: TaskWithBaseline, col: GanttColKey) => void
  onCommitEdit: (task: TaskWithBaseline) => void
  onCancelEdit: () => void
  onKeyDown: (e: React.KeyboardEvent, task: TaskWithBaseline, col: GanttColKey) => void
  onRowDetailClick: (taskId: string) => void
  onRowSelect: (taskId: string, e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent, taskId: string) => void
  onCellMouseDown: (task: TaskWithBaseline, col: GanttColKey, e: React.MouseEvent) => void
  onCellMouseEnter: (task: TaskWithBaseline, col: GanttColKey) => void
}

function TaskRow({
  task,
  rowHeight,
  columns,
  rowIndex,
  activeCell,
  selectedCell,
  selectionRange,
  editValue,
  isSelected,
  onEditValueChange,
  onCellClick,
  onCellDoubleClick,
  onCommitEdit,
  onCancelEdit,
  onKeyDown,
  onRowDetailClick,
  onRowSelect,
  onContextMenu,
  onCellMouseDown,
  onCellMouseEnter,
}: TaskRowProps) {
  const baseRowBg = isSelected
    ? 'bg-indigo-100'
    : rowIndex % 2 === 0
      ? 'bg-white'
      : 'bg-slate-50'

  return (
    <div
      className={`flex items-center border-b border-slate-200 transition-colors ${baseRowBg} hover:bg-blue-50`}
      style={{ height: rowHeight }}
      onClick={(e) => onRowSelect(task.id, e)}
      onContextMenu={(e) => onContextMenu(e, task.id)}
    >
      {columns.map((col, colIdx) => {
        const isEditing = activeCell?.taskId === task.id && activeCell?.col === col
        const cellKey = `${task.id}:${col}`
        const isInSelectionRange = selectionRange !== null && selectionRange.has(cellKey)
        const isSelected_ = !isEditing && !isInSelectionRange && selectedCell?.taskId === task.id && selectedCell?.col === col
        const isEditable = !NON_EDITABLE_COLS.has(col)
        const indentPx = colIdx === 0 ? task.depth * 16 : 0

        return (
          <div
            key={col}
            className={[
              'flex-shrink-0 flex items-center border-r border-slate-200 overflow-hidden',
              isEditing
                ? 'ring-2 ring-inset ring-indigo-500 bg-white'
                : isInSelectionRange
                  ? 'ring-2 ring-inset ring-indigo-400 bg-indigo-50'
                  : isSelected_
                    ? 'ring-2 ring-inset ring-indigo-400 bg-indigo-50'
                    : isEditable
                      ? 'cursor-pointer hover:bg-indigo-50'
                      : '',
            ].join(' ')}
            style={{
              width: COL_DEFS[col].width,
              height: '100%',
              paddingLeft: colIdx === 0 ? 8 + indentPx : 8,
              paddingRight: 8,
            }}
            onMouseDown={(e) => {
              if (col === 'updated_at') return
              if (isEditable) onCellMouseDown(task, col, e)
            }}
            onMouseEnter={() => {
              if (isEditable) onCellMouseEnter(task, col)
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (col === 'updated_at') {
                onRowDetailClick(task.id)
                return
              }
              // シングルクリックは行選択＋セル選択のみ（編集開始しない）
              onRowSelect(task.id, e)
              if (isEditable) onCellClick(task, col)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              if (isEditable) onCellDoubleClick(task, col)
            }}
          >
            {col === 'vendor' ? (
              task.vendor?.display_name ? (
                <Badge variant="secondary" className="text-xs truncate max-w-full">
                  {task.vendor.display_name}
                </Badge>
              ) : null
            ) : isEditing ? (
              <input
                autoFocus
                type={col === 'progress' ? 'number' : col === 'start_date' || col === 'end_date' ? 'date' : 'text'}
                min={col === 'progress' ? 0 : undefined}
                max={col === 'progress' ? 100 : undefined}
                value={editValue}
                onChange={(e) => onEditValueChange(e.target.value)}
                onFocus={(e) => {
                  // printableキーで開いた場合はカーソルを末尾に置く（全選択すると次打鍵で初期文字が消える）
                  if (!activeCell?.fromKey) e.target.select()
                }}
                onBlur={() => onCommitEdit(task)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.preventDefault(); onCancelEdit(); return }
                  onKeyDown(e, task, col)
                }}
                className="w-full text-xs bg-transparent border-none outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="text-xs text-slate-700 truncate w-full">
                {getDisplayValue(task, col)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── EmptyRow (Excel-style blank row for new-task entry) ─────────────────────

interface EmptyRowProps {
  rowHeight: number
  columns: GanttColKey[]
  rowIndex: number
  isEditing: boolean
  editValue: string
  selectedCol: GanttColKey | null
  onEditValueChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
  onDoubleClick: () => void
  onCellClick: (col: GanttColKey) => void
}

function EmptyRow({
  rowHeight,
  columns,
  rowIndex,
  isEditing,
  editValue,
  selectedCol,
  onEditValueChange,
  onCommit,
  onCancel,
  onDoubleClick,
  onCellClick,
}: EmptyRowProps) {
  const baseRowBg = rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'

  return (
    <div
      className={`flex items-center ${baseRowBg} hover:bg-blue-50 transition-colors`}
      style={{ height: rowHeight }}
      onDoubleClick={onDoubleClick}
    >
      {columns.map((col, colIdx) => {
        const isSelected = !isEditing && selectedCol === col
        const isEditingThisCell = col === 'name' && isEditing
        return (
          <div
            key={col}
            className={[
              'flex-shrink-0 flex items-center border-r border-dashed border-slate-300 overflow-hidden cursor-default',
              isEditingThisCell
                ? 'ring-2 ring-inset ring-indigo-500 bg-white'
                : isSelected
                  ? 'ring-2 ring-inset ring-indigo-400 bg-indigo-50'
                  : 'hover:bg-indigo-50',
            ].join(' ')}
            style={{
              width: COL_DEFS[col].width,
              height: '100%',
              paddingLeft: colIdx === 0 ? 8 : 8,
              paddingRight: 8,
              borderBottom: '1px dashed #cbd5e1',
            }}
            onClick={(e) => {
              e.stopPropagation()
              onCellClick(col)
            }}
          >
            {isEditingThisCell ? (
              <input
                autoFocus
                type="text"
                value={editValue}
                onChange={(e) => onEditValueChange(e.target.value)}
                onBlur={onCommit}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.preventDefault(); onCancel(); return }
                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); onCommit(); return }
                }}
                className="w-full text-xs bg-transparent border-none outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

// ─── ContextMenu ──────────────────────────────────────────────────────────────

interface ContextMenuProps {
  x: number
  y: number
  canEdit: boolean
  hasClipboard: boolean
  onInsertAbove: () => void
  onInsertBelow: () => void
  onCopy: () => void
  onCut: () => void
  onPaste: () => void
  onDelete: () => void
}

function ContextMenu({
  x,
  y,
  canEdit,
  hasClipboard,
  onInsertAbove,
  onInsertBelow,
  onCopy,
  onCut,
  onPaste,
  onDelete,
}: ContextMenuProps) {
  const menuItems: {
    label: string
    shortcut?: string
    onClick: () => void
    disabled: boolean
  }[] = [
    { label: '行を上に挿入', onClick: onInsertAbove, disabled: !canEdit },
    { label: '行を下に挿入', onClick: onInsertBelow, disabled: !canEdit },
    { label: 'コピー', shortcut: 'Ctrl+C', onClick: onCopy, disabled: !canEdit },
    { label: '切り取り', shortcut: 'Ctrl+X', onClick: onCut, disabled: !canEdit },
    { label: '貼り付け', shortcut: 'Ctrl+V', onClick: onPaste, disabled: !canEdit || !hasClipboard },
    { label: '削除', shortcut: 'Delete', onClick: onDelete, disabled: !canEdit },
  ]

  return (
    <div
      className="fixed z-50 bg-white border border-slate-200 rounded shadow-lg py-1 min-w-[180px]"
      style={{ left: x, top: y }}
      // Prevent the document click handler from firing immediately for this element
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item, i) => (
        <button
          key={i}
          disabled={item.disabled}
          onClick={item.onClick}
          className={[
            'w-full flex items-center justify-between px-3 py-1.5 text-xs text-left',
            item.disabled
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-slate-700 hover:bg-indigo-50 cursor-pointer',
          ].join(' ')}
        >
          <span>{item.label}</span>
          {item.shortcut && (
            <span className="ml-4 text-slate-400">{item.shortcut}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ─── GanttLeftPanel ───────────────────────────────────────────────────────────

// Flat list entry used for rendering: either a phase header or a task row
type RowEntry =
  | { kind: 'phase'; phase: Phase }
  | { kind: 'task'; task: TaskWithBaseline; visualIndex: number }

// Default cell value to use when clearing a cell during cut
function getDefaultRawValue(col: GanttColKey): string {
  switch (col) {
    case 'progress':   return '0'
    case 'start_date': return ''
    case 'end_date':   return ''
    // name is intentionally not cleared; callers should skip name for cut-clear
    default:           return ''
  }
}

export function GanttLeftPanel({ tasks, rowHeight, columns, permissions }: GanttLeftPanelProps) {
  const currentUserId = useProjectStore((s) => s.currentUserId)
  const currentProject = useProjectStore((s) => s.currentProject)
  const upsertTask = useTaskStore((s) => s.upsertTask)
  const removeTask = useTaskStore((s) => s.removeTask)
  const storeTasks = useTaskStore((s) => s.tasks)
  const phases = useTaskStore((s) => s.phases)
  const reorderTasks = useTaskStore((s) => s.reorderTasks)

  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null)
  // selectedCell: セル選択状態（ハイライトのみ、編集なし）
  const [selectedCell, setSelectedCell] = useState<CellId | null>(null)
  const [editValue, setEditValue] = useState('')

  // Cell drag-selection state
  const [selectionAnchor, setSelectionAnchor] = useState<CellId | null>(null)
  const [selectionHead, setSelectionHead] = useState<CellId | null>(null)
  const isDraggingCellsRef = useRef(false)
  // Used for the TaskDetailModal (click on updated_at column)
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  // Primary selected row (used for keyboard shortcuts when single selection)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  // Full set of selected row IDs for multi-select
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())

  // Clipboard for row-level copy/paste (context menu)
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null)
  // Whether the clipboard came from a cut (so we delete source after paste)
  const cutTaskIdRef = useRef<string | null>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string } | null>(null)

  // Index of the empty row currently in edit mode (null = none)
  const [editingEmptyRowIndex, setEditingEmptyRowIndex] = useState<number | null>(null)
  const [emptyRowValue, setEmptyRowValue] = useState('')
  // Extra empty rows added by the "+ 10行追加" button
  const [extraEmptyRows, setExtraEmptyRows] = useState(0)
  // Selected empty row cell (single-click selection; paste origin)
  const [selectedEmptyRow, setSelectedEmptyRow] = useState<{ rowIndex: number; col: GanttColKey } | null>(null)
  // Ref so handleGridKeyDown can read the latest empty-row count without stale closures
  const emptyRowCountRef = useRef(0)
  // taskId that should receive name-cell autofocus after insert
  const [focusInsertedTaskId, setFocusInsertedTaskId] = useState<string | null>(null)

  // Ref to the focusable grid container so we can restore focus after cell selection
  const gridRef = useRef<HTMLDivElement>(null)

  const preOrderSnapshot = useRef<string[]>([])
  // Track commit-in-progress to prevent double-fire from blur+Enter
  const committingRef = useRef(false)
  // Refs so that mousedown handlers can read fresh edit state without stale closures
  const activeCellRef = useRef<ActiveCell | null>(null)
  const editValueRef = useRef('')
  const tasksRef = useRef<TaskWithBaseline[]>(tasks)

  // ─── Phase grouping ──────────────────────────────────────────────────────────

  // Build a flat list of rows: phase headers interleaved with task rows.
  // Tasks with no phase go into an "未分類" group at the end.
  const rows: RowEntry[] = (() => {
    const sortedPhases = [...phases].sort((a, b) => a.display_order - b.display_order)
    const result: RowEntry[] = []
    let visualIndex = 0

    for (const phase of sortedPhases) {
      const phaseTasks = tasks.filter((t) => t.phase_id === phase.id)
      if (phaseTasks.length === 0) continue
      result.push({ kind: 'phase', phase })
      for (const task of phaseTasks) {
        result.push({ kind: 'task', task, visualIndex })
        visualIndex++
      }
    }

    const unassigned = tasks.filter((t) => t.phase_id === null)
    if (unassigned.length > 0) {
      // Synthetic phase-like header for unassigned tasks
      const unassignedPhase: Phase = {
        id: '__unassigned__',
        project_id: '',
        name: '未分類',
        display_order: Infinity,
        color: '#94a3b8',
        start_date: null,
        end_date: null,
      }
      result.push({ kind: 'phase', phase: unassignedPhase })
      for (const task of unassigned) {
        result.push({ kind: 'task', task, visualIndex })
        visualIndex++
      }
    }

    return result
  })()

  const detailTask = detailTaskId != null
    ? storeTasks.find((t) => t.id === detailTaskId) ?? null
    : null

  const totalWidth = columns.reduce((sum, key) => sum + COL_DEFS[key].width, 0)

  const canEditTask = useCallback((task: TaskWithBaseline): boolean => {
    if (!permissions) return false
    if (!currentUserId) return permissions.canEdit
    return canVendorEditTask(permissions, task.vendor_id ?? null, currentUserId)
  }, [permissions, currentUserId])

  // selectCell: セルをハイライト選択するだけ（編集開始しない）
  const selectCell = useCallback((task: TaskWithBaseline, col: GanttColKey) => {
    if (NON_EDITABLE_COLS.has(col)) return
    setSelectedCell({ taskId: task.id, col })
    // Keyboard events reach handleGridKeyDown only while the grid div has focus.
    // Restore focus here because onMouseDown called e.preventDefault(), which
    // suppressed the browser's default focus-transfer to the grid container.
    gridRef.current?.focus()
  }, [])

  // openCell: 編集モードを開始する（ダブルクリック / F2 / printable key 入力で呼ぶ）
  // fromKey=true のとき input の onFocus で全選択をスキップする（バグ1対策）
  const openCell = useCallback((task: TaskWithBaseline, col: GanttColKey, initialValue?: string) => {
    if (!canEditTask(task) || NON_EDITABLE_COLS.has(col)) return
    const fromKey = initialValue !== undefined
    setSelectedCell(null)
    setSelectionAnchor(null)
    setSelectionHead(null)
    setActiveCell({ taskId: task.id, col, fromKey })
    setEditValue(initialValue !== undefined ? initialValue : getRawValue(task, col))
  }, [canEditTask])

  // commitEditWithValues: core save logic that reads cell + value from explicit arguments
  // so it can be called from both the state-based commitEdit and the ref-based path.
  const commitEditWithValues = useCallback(async (
    cell: ActiveCell,
    currentValue: string,
    task: TaskWithBaseline,
  ) => {
    if (committingRef.current) return
    committingRef.current = true

    const { taskId, col: field } = cell
    setActiveCell(null)

    type PatchPayload = {
      id: string
      version: number
      name?: string
      start_date?: string | null
      end_date?: string | null
      progress?: number
    }
    const payload: PatchPayload = { id: taskId, version: task.version }

    if (field === 'name') {
      const trimmed = currentValue.trim()
      if (trimmed) payload.name = trimmed
    } else if (field === 'start_date') {
      payload.start_date = currentValue || null
    } else if (field === 'end_date') {
      payload.end_date = currentValue || null
    } else if (field === 'progress') {
      const n = parseInt(currentValue, 10)
      if (!isNaN(n)) payload.progress = Math.min(100, Math.max(0, n))
    }

    if (Object.keys(payload).length <= 2) {
      committingRef.current = false
      return
    }

    upsertTask({ ...task, ...payload } as Task)

    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const json = await res.json() as { data: Task }
        upsertTask(json.data)
      } else {
        upsertTask(task as Task)
        console.error('Failed to save task')
      }
    } catch (err) {
      upsertTask(task as Task)
      console.error('Failed to save task:', err)
    } finally {
      committingRef.current = false
    }
  }, [upsertTask])

  const commitEdit = useCallback((task: TaskWithBaseline): Promise<void> => {
    if (!activeCell) return Promise.resolve()
    return commitEditWithValues(activeCell, editValue, task)
  }, [activeCell, editValue, commitEditWithValues])

  const cancelEdit = useCallback(() => {
    // 編集キャンセル後は選択状態（ハイライト）に戻す
    if (activeCell) setSelectedCell(activeCell)
    setActiveCell(null)
    setEditValue('')
    committingRef.current = false
  }, [activeCell])

  // Navigate to adjacent cell on Tab/Enter
  const handleCellKeyDown = useCallback((
    e: React.KeyboardEvent,
    task: TaskWithBaseline,
    col: GanttColKey,
  ) => {
    if (e.key !== 'Tab' && e.key !== 'Enter') return
    e.preventDefault()

    // commit is triggered by blur (Tab moves focus away), avoid double-fire
    if (e.key === 'Tab') {
      // blur will fire commitEdit; after that we navigate
      const editableCols = columns.filter((c) => !NON_EDITABLE_COLS.has(c))
      const colIdx = editableCols.indexOf(col)
      const backward = e.shiftKey

      if (backward) {
        if (colIdx > 0) {
          const nextCol = editableCols[colIdx - 1]
          // Delay so blur fires first
          setTimeout(() => openCell(task, nextCol), 0)
        } else {
          const taskIdx = tasks.findIndex((t) => t.id === task.id)
          if (taskIdx > 0) {
            const prevTask = tasks[taskIdx - 1]
            const lastCol = editableCols[editableCols.length - 1]
            setTimeout(() => openCell(prevTask, lastCol), 0)
          }
        }
      } else {
        if (colIdx < editableCols.length - 1) {
          const nextCol = editableCols[colIdx + 1]
          setTimeout(() => openCell(task, nextCol), 0)
        } else {
          const taskIdx = tasks.findIndex((t) => t.id === task.id)
          if (taskIdx < tasks.length - 1) {
            const nextTask = tasks[taskIdx + 1]
            setTimeout(() => openCell(nextTask, editableCols[0]), 0)
          } else {
            // Move to the first empty row and open it for editing
            setTimeout(() => {
              setEditingEmptyRowIndex(0)
              setEmptyRowValue('')
            }, 0)
          }
        }
      }
    } else {
      // Enter: commit then move to same column next row
      void commitEdit(task).then(() => {
        const taskIdx = tasks.findIndex((t) => t.id === task.id)
        if (taskIdx < tasks.length - 1) {
          const nextTask = tasks[taskIdx + 1]
          setTimeout(() => openCell(nextTask, col), 0)
        } else {
          setTimeout(() => {
            setEditingEmptyRowIndex(0)
            setEmptyRowValue('')
          }, 0)
        }
      })
    }
  }, [columns, tasks, openCell, commitEdit])

  const submitEmptyRow = useCallback(async () => {
    if (committingRef.current) return
    committingRef.current = true

    const trimmed = emptyRowValue.trim()
    setEditingEmptyRowIndex(null)
    setEmptyRowValue('')

    if (!trimmed || !currentProject) {
      committingRef.current = false
      return
    }

    const firstPhase = phases.length > 0
      ? [...phases].sort((a, b) => a.display_order - b.display_order)[0]
      : null
    const firstPhaseId = firstPhase?.id ?? null

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: currentProject.id,
          phase_id: firstPhaseId,
          name: trimmed,
          status: 'not_started',
          progress: 0,
          display_order: storeTasks.length,
        }),
      })

      if (!res.ok) {
        const json = await res.json() as { error?: string }
        console.error('Failed to create task:', json.error)
        committingRef.current = false
        return
      }

      const json = await res.json() as { data: Task }
      upsertTask(json.data)
      committingRef.current = false
    } catch (err) {
      console.error('Failed to create task:', err)
      committingRef.current = false
    }
  }, [emptyRowValue, currentProject, phases, storeTasks.length, upsertTask])

  const cancelEmptyRow = useCallback(() => {
    setEditingEmptyRowIndex(null)
    setEmptyRowValue('')
    committingRef.current = false
  }, [])

  // ─── Row selection ───────────────────────────────────────────────────────────

  // Ordered list of task IDs as displayed (for shift-range selection)
  const displayedTaskIds = rows
    .filter((r): r is Extract<RowEntry, { kind: 'task' }> => r.kind === 'task')
    .map((r) => r.task.id)

  const handleRowSelect = useCallback((taskId: string, e: React.MouseEvent) => {
    const isMod = e.ctrlKey || e.metaKey

    if (e.shiftKey && selectedRowId) {
      // Range selection: select all tasks between anchor and current
      const anchorIdx = displayedTaskIds.indexOf(selectedRowId)
      const currentIdx = displayedTaskIds.indexOf(taskId)
      if (anchorIdx !== -1 && currentIdx !== -1) {
        const lo = Math.min(anchorIdx, currentIdx)
        const hi = Math.max(anchorIdx, currentIdx)
        const rangeIds = displayedTaskIds.slice(lo, hi + 1)
        setSelectedRowIds(new Set(rangeIds))
        // Keep anchor as primary selected row
        return
      }
    }

    if (isMod) {
      // Toggle the clicked task in the selection set
      setSelectedRowIds((prev) => {
        const next = new Set(prev)
        if (next.has(taskId)) {
          next.delete(taskId)
        } else {
          next.add(taskId)
        }
        return next
      })
      setSelectedRowId(taskId)
      return
    }

    // Plain click: single selection
    setSelectedRowId(taskId)
    setSelectedRowIds(new Set([taskId]))
  }, [selectedRowId, displayedTaskIds])

  // ─── Cell drag-selection ─────────────────────────────────────────────────────

  // Ordered list of editable columns as displayed
  const editableCols = columns.filter((c) => !NON_EDITABLE_COLS.has(c))

  // Compute the set of cell keys covered by the current anchor↔head rectangle
  const selectionRange: Set<string> | null = (() => {
    if (!selectionAnchor || !selectionHead) return null
    const taskIds = displayedTaskIds
    const anchorRowIdx = taskIds.indexOf(selectionAnchor.taskId)
    const headRowIdx = taskIds.indexOf(selectionHead.taskId)
    const anchorColIdx = editableCols.indexOf(selectionAnchor.col)
    const headColIdx = editableCols.indexOf(selectionHead.col)
    if (anchorRowIdx === -1 || headRowIdx === -1 || anchorColIdx === -1 || headColIdx === -1) return null

    const rowLo = Math.min(anchorRowIdx, headRowIdx)
    const rowHi = Math.max(anchorRowIdx, headRowIdx)
    const colLo = Math.min(anchorColIdx, headColIdx)
    const colHi = Math.max(anchorColIdx, headColIdx)

    const set = new Set<string>()
    for (let r = rowLo; r <= rowHi; r++) {
      for (let c = colLo; c <= colHi; c++) {
        set.add(`${taskIds[r]}:${editableCols[c]}`)
      }
    }
    return set
  })()

  const handleCellMouseDown = useCallback((task: TaskWithBaseline, col: GanttColKey, e: React.MouseEvent) => {
    // Only left button; ignore modifier-clicks used for row multi-select
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return

    // e.preventDefault() suppresses the browser's default focus-transfer, which
    // means the editing input never receives a blur event. Commit the active edit
    // explicitly here using refs so the closure always sees the latest values.
    const cell = activeCellRef.current
    if (cell && !(cell.taskId === task.id && cell.col === col)) {
      const editingTask = tasksRef.current.find((t) => t.id === cell.taskId)
      if (editingTask) void commitEditWithValues(cell, editValueRef.current, editingTask)
    }

    // Prevent browser text selection during drag (must come after the commit above)
    e.preventDefault()
    isDraggingCellsRef.current = true
    setSelectionAnchor({ taskId: task.id, col })
    setSelectionHead({ taskId: task.id, col })
    setSelectedCell(null)
  }, [commitEditWithValues])

  const handleCellMouseEnter = useCallback((task: TaskWithBaseline, col: GanttColKey) => {
    if (!isDraggingCellsRef.current) return
    setSelectionHead({ taskId: task.id, col })
  }, [])

  // Keep latest anchor/head in refs so the mouseup handler can read them without stale closures
  const selectionAnchorRef = useRef<CellId | null>(null)
  const selectionHeadRef = useRef<CellId | null>(null)
  selectionAnchorRef.current = selectionAnchor
  selectionHeadRef.current = selectionHead
  // Keep edit state in refs so mousedown handlers can read fresh values without stale closures
  activeCellRef.current = activeCell
  editValueRef.current = editValue
  tasksRef.current = tasks

  // End cell drag on mouseup anywhere in the document
  useEffect(() => {
    const onMouseUp = () => {
      if (!isDraggingCellsRef.current) return
      isDraggingCellsRef.current = false
      const anchor = selectionAnchorRef.current
      const head = selectionHeadRef.current
      // If anchor === head (no drag distance), treat as single-cell selection
      if (
        anchor && head &&
        anchor.taskId === head.taskId && anchor.col === head.col
      ) {
        setSelectedCell(anchor)
        setSelectionAnchor(null)
        setSelectionHead(null)
      }
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])

  // ─── Spreadsheet operations (row-level, used by context menu) ────────────────

  const copyRow = useCallback((taskId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    cutTaskIdRef.current = null
    setClipboard({
      name: task.name,
      status: task.status,
      start_date: task.start_date,
      end_date: task.end_date,
      progress: task.progress,
      phase_id: task.phase_id,
    })
  }, [tasks])

  const cutRow = useCallback((taskId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    cutTaskIdRef.current = taskId
    setClipboard({
      name: task.name,
      status: task.status,
      start_date: task.start_date,
      end_date: task.end_date,
      progress: task.progress,
      phase_id: task.phase_id,
    })
  }, [tasks])

  const pasteRow = useCallback(async (afterTaskId: string) => {
    if (!clipboard || !currentProject) return

    // Create at a temporary display_order; reorder call below sets the real position
    const tempDisplayOrder = tasks.length

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: currentProject.id,
          phase_id: clipboard.phase_id,
          name: `${clipboard.name} のコピー`,
          status: clipboard.status,
          start_date: clipboard.start_date,
          end_date: clipboard.end_date,
          progress: clipboard.progress,
          display_order: tempDisplayOrder,
          dependencies: [],
        }),
      })

      if (!res.ok) {
        const json = await res.json() as { error?: string }
        console.error('Failed to paste task:', json.error)
        return
      }

      const json = await res.json() as { data: Task }
      const newTask = json.data

      // Splice the new task directly after afterTaskId and reorder all tasks so there are no gaps
      const afterIdx = tasks.findIndex((t) => t.id === afterTaskId)
      const insertAt = afterIdx >= 0 ? afterIdx + 1 : tasks.length
      const orderedIds = tasks.map((t) => t.id)
      orderedIds.splice(insertAt, 0, newTask.id)
      const items = orderedIds.map((id, index) => ({ id, display_order: index }))

      try {
        await fetch('/api/tasks/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: currentProject.id, items }),
        })
      } catch (reorderErr) {
        console.error('Failed to reorder after paste:', reorderErr)
      }

      upsertTask({ ...newTask, display_order: insertAt })
      reorderTasks(orderedIds)

      // If this was a cut, delete the source task after pasting
      if (cutTaskIdRef.current) {
        const sourceId = cutTaskIdRef.current
        cutTaskIdRef.current = null
        setClipboard(null)
        try {
          const delRes = await fetch(`/api/tasks?id=${encodeURIComponent(sourceId)}`, { method: 'DELETE' })
          if (delRes.ok) {
            removeTask(sourceId)
          }
        } catch (err) {
          console.error('Failed to delete cut task:', err)
        }
      }
    } catch (err) {
      console.error('Failed to paste task:', err)
    }
  }, [clipboard, currentProject, tasks, upsertTask, removeTask, reorderTasks])

  // Delete a single task by ID
  const deleteSingleRow = useCallback(async (taskId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/tasks?id=${encodeURIComponent(taskId)}`, { method: 'DELETE' })
      if (res.ok) {
        removeTask(taskId)
        return true
      } else {
        const json = await res.json() as { error?: string }
        console.error('Failed to delete task:', json.error)
        return false
      }
    } catch (err) {
      console.error('Failed to delete task:', err)
      return false
    }
  }, [removeTask])

  const deleteRow = useCallback(async (taskId: string) => {
    // When multiple rows are selected, delete all of them
    const idsToDelete = selectedRowIds.size > 1 ? [...selectedRowIds] : [taskId]

    await Promise.all(idsToDelete.map((id) => deleteSingleRow(id)))

    if (idsToDelete.includes(selectedRowId ?? '')) {
      setSelectedRowId(null)
    }
    setSelectedRowIds((prev) => {
      const next = new Set(prev)
      for (const id of idsToDelete) next.delete(id)
      return next
    })
  }, [selectedRowIds, selectedRowId, deleteSingleRow])

  const insertRow = useCallback(async (relativeToTaskId: string, position: 'above' | 'below') => {
    if (!currentProject) return

    const relIdx = tasks.findIndex((t) => t.id === relativeToTaskId)
    // Temporarily place the new task at the end; display_order will be fixed by reorder below
    const tempDisplayOrder = tasks.length

    const firstPhase = phases.length > 0
      ? [...phases].sort((a, b) => a.display_order - b.display_order)[0]
      : null
    const firstPhaseId = firstPhase?.id ?? null

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: currentProject.id,
          phase_id: firstPhaseId,
          name: '',
          status: 'not_started',
          progress: 0,
          display_order: tempDisplayOrder,
          dependencies: [],
        }),
      })

      if (!res.ok) {
        const json = await res.json() as { error?: string }
        console.error('Failed to insert task:', json.error)
        return
      }

      const json = await res.json() as { data: Task }
      const newTask = json.data

      // Build the desired ordered id list by splicing the new task into the correct position
      const insertAt = position === 'above'
        ? (relIdx >= 0 ? relIdx : 0)
        : (relIdx >= 0 ? relIdx + 1 : tasks.length)
      const orderedIds = tasks.map((t) => t.id)
      orderedIds.splice(insertAt, 0, newTask.id)

      // Persist the new display_order for all tasks
      const items = orderedIds.map((id, index) => ({ id, display_order: index }))
      try {
        await fetch('/api/tasks/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: currentProject.id, items }),
        })
      } catch (reorderErr) {
        console.error('Failed to reorder after insert:', reorderErr)
      }

      // Update local store: first add the new task, then reorder
      upsertTask({ ...newTask, display_order: insertAt })
      reorderTasks(orderedIds)

      setSelectedRowId(newTask.id)
      setSelectedRowIds(new Set([newTask.id]))
      // Signal the name cell to autofocus after render
      setFocusInsertedTaskId(newTask.id)
    } catch (err) {
      console.error('Failed to insert task:', err)
    }
  }, [currentProject, tasks, phases, upsertTask, reorderTasks])

  // Open the name cell for autofocus after an insert
  useEffect(() => {
    if (!focusInsertedTaskId) return
    const task = tasks.find((t) => t.id === focusInsertedTaskId)
    if (!task) return
    setFocusInsertedTaskId(null)
    setTimeout(() => openCell(task as TaskWithBaseline, 'name'), 0)
  }, [focusInsertedTaskId, tasks, openCell])

  // ─── Cell-level copy / cut / paste (TSV, Cmd+C/X/V) ─────────────────────────

  // Resolve the rectangular selection as ordered (rowIds × cols)
  const resolveSelectionRect = useCallback((): { rowIds: string[]; cols: GanttColKey[] } | null => {
    if (selectionRange && selectionAnchor && selectionHead) {
      const taskIds = displayedTaskIds
      const anchorRowIdx = taskIds.indexOf(selectionAnchor.taskId)
      const headRowIdx = taskIds.indexOf(selectionHead.taskId)
      const anchorColIdx = editableCols.indexOf(selectionAnchor.col)
      const headColIdx = editableCols.indexOf(selectionHead.col)
      if (anchorRowIdx === -1 || headRowIdx === -1 || anchorColIdx === -1 || headColIdx === -1) return null
      const rowLo = Math.min(anchorRowIdx, headRowIdx)
      const rowHi = Math.max(anchorRowIdx, headRowIdx)
      const colLo = Math.min(anchorColIdx, headColIdx)
      const colHi = Math.max(anchorColIdx, headColIdx)
      return {
        rowIds: taskIds.slice(rowLo, rowHi + 1),
        cols: editableCols.slice(colLo, colHi + 1),
      }
    }
    if (selectedCell) {
      return { rowIds: [selectedCell.taskId], cols: [selectedCell.col] }
    }
    return null
  }, [selectionRange, selectionAnchor, selectionHead, selectedCell, displayedTaskIds, editableCols])

  const copyCellsToClipboard = useCallback(async (rect: { rowIds: string[]; cols: GanttColKey[] }) => {
    const lines = rect.rowIds.map((rowId) => {
      const task = tasks.find((t) => t.id === rowId)
      if (!task) return rect.cols.map(() => '').join('\t')
      return rect.cols.map((col) => getRawValue(task, col)).join('\t')
    })
    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // navigator.clipboard is unavailable (non-secure context) — use execCommand fallback
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }, [tasks])

  const handleCellCopy = useCallback(async () => {
    const rect = resolveSelectionRect()
    if (!rect) return
    await copyCellsToClipboard(rect)
  }, [resolveSelectionRect, copyCellsToClipboard])

  const handleCellCut = useCallback(async () => {
    const rect = resolveSelectionRect()
    if (!rect || !permissions?.canEdit) return
    await copyCellsToClipboard(rect)

    // Clear editable cells in the selection (name is not cleared on cut)
    const patches: { task: TaskWithBaseline; payload: Record<string, string | number | null> }[] = []
    for (const rowId of rect.rowIds) {
      const task = tasks.find((t) => t.id === rowId)
      if (!task || !canEditTask(task)) continue
      const payload: Record<string, string | number | null> = {}
      for (const col of rect.cols) {
        if (col === 'name') continue // name is not cleared on cut
        const defaultVal = getDefaultRawValue(col)
        if (col === 'progress') {
          payload[col] = parseInt(defaultVal, 10)
        } else {
          payload[col] = defaultVal || null
        }
      }
      if (Object.keys(payload).length > 0) patches.push({ task, payload })
    }

    for (const { task, payload } of patches) {
      upsertTask({ ...task, ...payload } as Task)
      try {
        const res = await fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: task.id, version: task.version, ...payload }),
        })
        if (res.ok) {
          const json = await res.json() as { data: Task }
          upsertTask(json.data)
        } else {
          upsertTask(task as Task)
        }
      } catch {
        upsertTask(task as Task)
      }
    }
  }, [resolveSelectionRect, copyCellsToClipboard, tasks, canEditTask, permissions, upsertTask])

  const handleCellPaste = useCallback(async () => {
    if (!permissions?.canEdit) return
    // Origin cell: top-left of selection range, or selectedCell
    let originTaskId: string | null = null
    let originCol: GanttColKey | null = null

    if (selectionRange && selectionAnchor && selectionHead) {
      const taskIds = displayedTaskIds
      const anchorRowIdx = taskIds.indexOf(selectionAnchor.taskId)
      const headRowIdx = taskIds.indexOf(selectionHead.taskId)
      const anchorColIdx = editableCols.indexOf(selectionAnchor.col)
      const headColIdx = editableCols.indexOf(selectionHead.col)
      originTaskId = taskIds[Math.min(anchorRowIdx, headRowIdx)]
      originCol = editableCols[Math.min(anchorColIdx, headColIdx)]
    } else if (selectedCell) {
      originTaskId = selectedCell.taskId
      originCol = selectedCell.col
    }

    if (!originTaskId || !originCol) return

    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      // navigator.clipboard.readText is unavailable (non-secure context or permission denied)
      return
    }

    const pasteRows = text.split('\n').map((line) => line.split('\t'))
    const originRowIdx = displayedTaskIds.indexOf(originTaskId)
    const originColIdx = editableCols.indexOf(originCol)
    if (originRowIdx === -1 || originColIdx === -1) return

    const patches: { task: TaskWithBaseline; payload: Record<string, string | number | null> }[] = []

    for (let r = 0; r < pasteRows.length; r++) {
      const targetRowIdx = originRowIdx + r
      if (targetRowIdx >= displayedTaskIds.length) break
      const targetTaskId = displayedTaskIds[targetRowIdx]
      const task = tasks.find((t) => t.id === targetTaskId)
      if (!task || !canEditTask(task)) continue

      const payload: Record<string, string | number | null> = {}
      for (let c = 0; c < pasteRows[r].length; c++) {
        const targetColIdx = originColIdx + c
        if (targetColIdx >= editableCols.length) break
        const col = editableCols[targetColIdx]
        if (NON_EDITABLE_COLS.has(col)) continue
        const rawVal = pasteRows[r][c]
        if (col === 'progress') {
          const n = parseInt(rawVal, 10)
          payload[col] = isNaN(n) ? 0 : Math.min(100, Math.max(0, n))
        } else if (col === 'start_date' || col === 'end_date') {
          payload[col] = rawVal || null
        } else {
          payload[col] = rawVal
        }
      }
      if (Object.keys(payload).length > 0) patches.push({ task, payload })
    }

    for (const { task, payload } of patches) {
      upsertTask({ ...task, ...payload } as Task)
      try {
        const res = await fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: task.id, version: task.version, ...payload }),
        })
        if (res.ok) {
          const json = await res.json() as { data: Task }
          upsertTask(json.data)
        } else {
          upsertTask(task as Task)
        }
      } catch {
        upsertTask(task as Task)
      }
    }
  }, [
    permissions,
    selectionRange,
    selectionAnchor,
    selectionHead,
    selectedCell,
    displayedTaskIds,
    editableCols,
    tasks,
    canEditTask,
    upsertTask,
  ])

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing inside an input / textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return

      const isMod = e.ctrlKey || e.metaKey
      if (!selectedRowId || !permissions?.canEdit) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        void deleteRow(selectedRowId)
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedRowId, permissions, deleteRow])

  // ─── Context menu ────────────────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent, taskId: string) => {
    e.preventDefault()
    // If right-clicking a task not in the current selection, collapse selection to just that task
    if (!selectedRowIds.has(taskId)) {
      setSelectedRowId(taskId)
      setSelectedRowIds(new Set([taskId]))
    }
    setContextMenu({ x: e.clientX, y: e.clientY, taskId })
  }, [selectedRowIds])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  // Close context menu when clicking anywhere outside
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => closeContextMenu()
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [contextMenu, closeContextMenu])

  // Reset committingRef whenever activeCell becomes null externally
  useEffect(() => {
    if (!activeCell) committingRef.current = false
  }, [activeCell])

  // ─── グリッドコンテナのキーボード操作（選択中セルへの操作）────────────────────

  const handleGridKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // 入力中（編集モード）は input 内の onKeyDown が担当するのでここでは処理しない
    if (activeCell) return

    const isMod = e.ctrlKey || e.metaKey

    // ─── セル範囲コピー / 切り取り / 貼り付け ───────────────────────────────
    if (isMod && (selectedCell || selectionRange)) {
      if (e.key === 'c') {
        e.preventDefault()
        void handleCellCopy()
        return
      }
      if (e.key === 'x') {
        e.preventDefault()
        void handleCellCut()
        return
      }
      if (e.key === 'v') {
        e.preventDefault()
        void handleCellPaste()
        return
      }
    }

    const editableCols_ = columns.filter((c) => !NON_EDITABLE_COLS.has(c))

    // ─── 空白行が選択中のキーボード操作 ─────────────────────────────────────
    if (!selectedCell && selectedEmptyRow) {
      const { rowIndex, col } = selectedEmptyRow
      const colIdx = editableCols_.indexOf(col)

      if (isMod && e.key === 'v') {
        e.preventDefault()
        // Paste into empty row: create a new task using clipboard text as name
        const doPaste = async (text: string) => {
          const value = text.split('\n')[0]?.split('\t')[0]?.trim() ?? ''
          if (!value) return
          await submitEmptyRow()
          // submitEmptyRow uses emptyRowValue state; instead invoke the API directly here
          // with the clipboard text. Reset selection after creation.
          setSelectedEmptyRow(null)
        }
        navigator.clipboard.readText().then((t) => void doPaste(t)).catch(() => {
          // Cannot read clipboard; open edit mode so user can type
          setEditingEmptyRowIndex(rowIndex)
          setEmptyRowValue('')
        })
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (rowIndex > 0) {
          setSelectedEmptyRow({ rowIndex: rowIndex - 1, col })
        } else if (tasks.length > 0) {
          const lastTask = tasks[tasks.length - 1]
          setSelectedEmptyRow(null)
          setSelectedCell({ taskId: lastTask.id, col: NON_EDITABLE_COLS.has(col) ? editableCols_[0] : col })
          setSelectedRowId(lastTask.id)
          setSelectedRowIds(new Set([lastTask.id]))
        }
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (rowIndex < emptyRowCountRef.current - 1) {
          setSelectedEmptyRow({ rowIndex: rowIndex + 1, col })
        }
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (colIdx > 0) setSelectedEmptyRow({ rowIndex, col: editableCols_[colIdx - 1] })
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (colIdx < editableCols_.length - 1) setSelectedEmptyRow({ rowIndex, col: editableCols_[colIdx + 1] })
        return
      }
      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault()
        setEditingEmptyRowIndex(rowIndex)
        setEmptyRowValue('')
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedEmptyRow(null)
        return
      }
      // Printable key → open edit mode on the empty row
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setEditingEmptyRowIndex(rowIndex)
        setEmptyRowValue(e.key)
        return
      }
      return
    }

    // 選択中セルがなければ何もしない
    if (!selectedCell) {
      // 選択行があれば最初の編集可能列を選択
      if (selectedRowId) {
        const task = tasks.find((t) => t.id === selectedRowId)
        if (task && editableCols_.length > 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'F2' || e.key === 'Enter')) {
          e.preventDefault()
          setSelectedCell({ taskId: task.id, col: editableCols_[0] })
        }
      }
      return
    }

    const taskIdx = tasks.findIndex((t) => t.id === selectedCell.taskId)
    const task = tasks[taskIdx]
    if (!task) return

    const colIdx = editableCols_.indexOf(selectedCell.col)

    // printable文字キー（修飾キーなし）→ セル内容をクリアして編集開始
    if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault()
      openCell(task as TaskWithBaseline, selectedCell.col, e.key)
      return
    }

    switch (e.key) {
      case 'F2': {
        // 内容保持で編集開始
        e.preventDefault()
        openCell(task as TaskWithBaseline, selectedCell.col)
        return
      }
      case 'Enter': {
        // 内容保持で編集開始（Excelと同じ挙動）
        e.preventDefault()
        openCell(task as TaskWithBaseline, selectedCell.col)
        return
      }
      case 'ArrowUp': {
        e.preventDefault()
        if (taskIdx > 0) {
          const prevTask = tasks[taskIdx - 1]
          setSelectedCell({ taskId: prevTask.id, col: selectedCell.col })
          setSelectedRowId(prevTask.id)
          setSelectedRowIds(new Set([prevTask.id]))
        }
        return
      }
      case 'ArrowDown': {
        e.preventDefault()
        if (taskIdx < tasks.length - 1) {
          const nextTask = tasks[taskIdx + 1]
          setSelectedCell({ taskId: nextTask.id, col: selectedCell.col })
          setSelectedRowId(nextTask.id)
          setSelectedRowIds(new Set([nextTask.id]))
        } else if (emptyRowCountRef.current > 0) {
          // Move from the last task row into the first empty row
          setSelectedCell(null)
          setSelectedEmptyRow({ rowIndex: 0, col: NON_EDITABLE_COLS.has(selectedCell.col) ? editableCols_[0] : selectedCell.col })
        }
        return
      }
      case 'ArrowLeft': {
        e.preventDefault()
        if (colIdx > 0) {
          setSelectedCell({ taskId: selectedCell.taskId, col: editableCols_[colIdx - 1] })
        }
        return
      }
      case 'ArrowRight': {
        e.preventDefault()
        if (colIdx < editableCols_.length - 1) {
          setSelectedCell({ taskId: selectedCell.taskId, col: editableCols_[colIdx + 1] })
        }
        return
      }
      case 'Tab': {
        e.preventDefault()
        if (e.shiftKey) {
          if (colIdx > 0) {
            setSelectedCell({ taskId: selectedCell.taskId, col: editableCols_[colIdx - 1] })
          } else if (taskIdx > 0) {
            const prevTask = tasks[taskIdx - 1]
            setSelectedCell({ taskId: prevTask.id, col: editableCols_[editableCols_.length - 1] })
            setSelectedRowId(prevTask.id)
            setSelectedRowIds(new Set([prevTask.id]))
          }
        } else {
          if (colIdx < editableCols_.length - 1) {
            setSelectedCell({ taskId: selectedCell.taskId, col: editableCols_[colIdx + 1] })
          } else if (taskIdx < tasks.length - 1) {
            const nextTask = tasks[taskIdx + 1]
            setSelectedCell({ taskId: nextTask.id, col: editableCols_[0] })
            setSelectedRowId(nextTask.id)
            setSelectedRowIds(new Set([nextTask.id]))
          }
        }
        return
      }
      case 'Escape': {
        e.preventDefault()
        setSelectedCell(null)
        return
      }
    }
  }, [
    activeCell,
    selectedCell,
    selectedEmptyRow,
    selectionRange,
    selectedRowId,
    tasks,
    columns,
    openCell,
    handleCellCopy,
    handleCellCut,
    handleCellPaste,
    submitEmptyRow,
  ])

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden" style={{ width: totalWidth }}>
        {/* Header */}
        <div
          className="flex items-center border-b border-slate-200 bg-slate-50 flex-shrink-0 sticky top-0 z-10"
          style={{ height: 56 }}
        >
          {columns.map((col) => (
            <div
              key={col}
              className="flex-shrink-0 flex items-center px-2 border-r border-slate-200 text-xs font-medium text-slate-500 truncate"
              style={{ width: COL_DEFS[col].width, height: '100%' }}
            >
              {COL_DEFS[col].label}
            </div>
          ))}
        </div>

        {/* Rows */}
        {/* tabIndex={0} でフォーカス可能にし、選択中セルへのキーボード操作を受け取る */}
        <div
          ref={gridRef}
          className="flex-1 overflow-y-auto overflow-x-hidden outline-none"
          style={{ scrollbarWidth: 'none' }}
          tabIndex={0}
          onKeyDown={handleGridKeyDown}
          onMouseDown={(e) => {
            // Commit any active edit when the user clicks anywhere in the grid
            // that is not the editing input itself (e.g. phase rows).
            // Cell clicks are handled more precisely in handleCellMouseDown; this
            // covers the remaining areas where blur is suppressed by preventDefault.
            const cell = activeCellRef.current
            if (!cell) return
            if (e.target instanceof HTMLInputElement) return
            const editingTask = tasksRef.current.find((t) => t.id === cell.taskId)
            if (editingTask) void commitEditWithValues(cell, editValueRef.current, editingTask)
          }}
        >
          {rows.map((row) => {
            if (row.kind === 'phase') {
              return (
                <PhaseRow
                  key={`phase-${row.phase.id}`}
                  phase={row.phase}
                  rowHeight={rowHeight}
                  columns={columns}
                />
              )
            }

            const { task, visualIndex } = row
            return (
              <TaskRow
                key={task.id}
                task={task}
                rowHeight={rowHeight}
                columns={columns}
                rowIndex={visualIndex}
                activeCell={activeCell}
                selectedCell={selectedCell}
                editValue={editValue}
                isSelected={selectedRowIds.has(task.id)}
                selectionRange={selectionRange}
                onEditValueChange={setEditValue}
                onCellClick={selectCell}
                onCellDoubleClick={openCell}
                onCommitEdit={commitEdit}
                onCancelEdit={cancelEdit}
                onKeyDown={handleCellKeyDown}
                onRowDetailClick={(id) => setDetailTaskId(id)}
                onRowSelect={handleRowSelect}
                onContextMenu={handleContextMenu}
                onCellMouseDown={handleCellMouseDown}
                onCellMouseEnter={handleCellMouseEnter}
              />
            )
          })}

          {permissions?.canEdit && (() => {
            const MIN_TOTAL_ROWS = 20
            const emptyRowCount = Math.max(MIN_TOTAL_ROWS - tasks.length, 0) + extraEmptyRows
            // Keep ref in sync so handleGridKeyDown can read the latest count without stale closures
            emptyRowCountRef.current = emptyRowCount
            return Array.from({ length: emptyRowCount }).map((_, i) => (
              <EmptyRow
                key={`empty-${i}`}
                rowHeight={rowHeight}
                columns={columns}
                rowIndex={tasks.length + i}
                isEditing={editingEmptyRowIndex === i}
                editValue={emptyRowValue}
                selectedCol={selectedEmptyRow?.rowIndex === i ? selectedEmptyRow.col : null}
                onEditValueChange={setEmptyRowValue}
                onCommit={() => { void submitEmptyRow() }}
                onCancel={cancelEmptyRow}
                onDoubleClick={() => {
                  setEditingEmptyRowIndex(i)
                  setEmptyRowValue('')
                  setSelectedEmptyRow(null)
                }}
                onCellClick={(col) => {
                  setSelectedEmptyRow({ rowIndex: i, col })
                  setSelectedCell(null)
                  setSelectionAnchor(null)
                  setSelectionHead(null)
                  gridRef.current?.focus()
                }}
              />
            ))
          })()}
        </div>

        {permissions?.canEdit && (
          <div className="flex justify-start px-2 py-1 flex-shrink-0">
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600 text-sm"
              onClick={() => setExtraEmptyRows((n) => n + 10)}
            >
              + 10行追加
            </button>
          </div>
        )}
      </div>

      {detailTask != null && (
        <TaskDetailModal
          task={detailTask}
          open={true}
          onClose={() => setDetailTaskId(null)}
        />
      )}

      {contextMenu != null && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canEdit={permissions?.canEdit === true}
          hasClipboard={clipboard !== null}
          onInsertAbove={() => {
            closeContextMenu()
            void insertRow(contextMenu.taskId, 'above')
          }}
          onInsertBelow={() => {
            closeContextMenu()
            void insertRow(contextMenu.taskId, 'below')
          }}
          onCopy={() => {
            closeContextMenu()
            copyRow(contextMenu.taskId)
          }}
          onCut={() => {
            closeContextMenu()
            cutRow(contextMenu.taskId)
          }}
          onPaste={() => {
            closeContextMenu()
            void pasteRow(contextMenu.taskId)
          }}
          onDelete={() => {
            closeContextMenu()
            void deleteRow(contextMenu.taskId)
          }}
        />
      )}
    </>
  )
}

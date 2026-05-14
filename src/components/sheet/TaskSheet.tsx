'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type CellContext,
} from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronsUpDown, Undo2, Redo2 } from 'lucide-react'
import { useTaskStore } from '@/store/taskStore'
import { useProjectStore } from '@/store/projectStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useVendorFilter } from '@/hooks/useVendorFilter'
import { useUndoRedo } from '@/hooks/useUndoRedo'
import { canVendorEditTask } from '@/types/rbac'
import { buildWbsNumberMap } from '@/lib/utils/taskTree'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Task, TaskStatus } from '@/types'

// ─── Context menu (right-click on task row) ───────────────────────────────────

interface SheetContextMenuProps {
  x: number
  y: number
  onDeleteTask: () => void
  onCopyRow: () => void
  onCutRow: () => void
  onClose: () => void
}

function SheetContextMenu({ x, y, onDeleteTask, onCopyRow, onCutRow, onClose }: SheetContextMenuProps) {
  // Clamp to viewport so the menu doesn't overflow off-screen
  const [pos, setPos] = useState({ left: x, top: y })
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuRef.current) return
    const { offsetWidth, offsetHeight } = menuRef.current
    const left = Math.min(x, window.innerWidth - offsetWidth - 8)
    const top = Math.min(y, window.innerHeight - offsetHeight - 8)
    setPos({ left, top })
  }, [x, y])

  // Close on any outside click
  useEffect(() => {
    const handler = () => onClose()
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-slate-200 rounded shadow-lg py-1 min-w-[160px]"
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onCopyRow}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-indigo-50 cursor-pointer"
      >
        <span>行をコピー</span>
        <span className="ml-4 text-slate-400">Cmd+C</span>
      </button>
      <button
        onClick={onCutRow}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-indigo-50 cursor-pointer"
      >
        <span>行を切り取り</span>
        <span className="ml-4 text-slate-400">Cmd+X</span>
      </button>
      <button
        onClick={onDeleteTask}
        className="w-full flex items-center px-3 py-1.5 text-xs text-left text-red-600 hover:bg-red-50 cursor-pointer"
      >
        行を削除
      </button>
    </div>
  )
}

// ─── Module augmentation for typed table meta ─────────────────────────────────

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData> {
    selectedCell: { rowId: string; columnId: string } | null
    editingCell: { rowId: string; columnId: string } | null
    /** initialChar: when entering edit mode via printable key, the character to pre-fill */
    initialChar: string | null
    /** wrapText: when true, cell display text wraps instead of truncating */
    wrapText: boolean
    selectCell: (rowId: string, columnId: string) => void
    editCell: (rowId: string, columnId: string, char?: string) => void
    commitCell: (rowId: string, columnId: string, value: string) => void
    cancelCell: () => void
    /** navigateCell moves selection; openEditOnArrive=true also enters edit mode (used by Tab/Enter in edit) */
    navigateCell: (rowId: string, columnId: string, direction: 'next' | 'prev' | 'up' | 'down', openEditOnArrive?: boolean) => void
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: '未着手',
  in_progress: '進行中',
  completed: '完了',
  blocked: 'ブロック中',
}

const STATUS_BADGE_CLASSES: Record<TaskStatus, string> = {
  not_started: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
}

// Column order used for Tab/Enter/Arrow navigation
const COLUMN_ORDER = ['name', 'status', 'start_date', 'end_date', 'progress'] as const

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return iso.slice(2, 10).replace(/-/g, '/')
}

function rawValue(task: Task, columnId: string): string {
  switch (columnId) {
    case 'name':       return task.name
    case 'status':     return task.status
    case 'start_date': return task.start_date ?? ''
    case 'end_date':   return task.end_date ?? ''
    case 'progress':   return String(task.progress)
    default:           return ''
  }
}

const EDITABLE_COLUMNS = new Set(COLUMN_ORDER)

// ─── Cell highlight helper ────────────────────────────────────────────────────

function cellClass(isSelected: boolean, isEditing: boolean, isEditable: boolean): string {
  const base = 'p-0 border border-slate-200 h-9'
  if (isEditing)  return `${base} ring-2 ring-inset ring-indigo-500 bg-white`
  if (isSelected) return `${base} ring-2 ring-inset ring-indigo-400 bg-indigo-50`
  if (isEditable) return `${base} hover:bg-indigo-50 cursor-pointer`
  return base
}

// ─── Shared key handler for edit mode ────────────────────────────────────────
// Called from within an active input/select while editing.

function makeEditKeyHandler(
  e: React.KeyboardEvent<HTMLElement>,
  rowId: string,
  columnId: string,
  getValue: () => string,
  meta: {
    commitCell: (r: string, c: string, v: string) => void
    cancelCell: () => void
    navigateCell: (r: string, c: string, dir: 'next' | 'prev' | 'up' | 'down', openEditOnArrive?: boolean) => void
  },
) {
  if (e.key === 'Tab') {
    e.preventDefault()
    meta.commitCell(rowId, columnId, getValue())
    // After confirm, move to next/prev cell and immediately enter edit mode (like GanttLeftPanel)
    meta.navigateCell(rowId, columnId, e.shiftKey ? 'prev' : 'next', true)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    meta.commitCell(rowId, columnId, getValue())
    // After confirm, move down and enter edit mode on that cell
    meta.navigateCell(rowId, columnId, 'down', true)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    meta.cancelCell()
  }
}

// ─── Editable cell renderers ──────────────────────────────────────────────────

function EditableTextCell({ info }: { info: CellContext<Task, unknown> }) {
  const { row, column, table } = info
  const meta = table.options.meta!
  const isEditing =
    meta.editingCell?.rowId === row.id && meta.editingCell.columnId === column.id
  const inputRef = useRef<HTMLInputElement>(null)

  // When entering edit mode via printable key, replace content with that character.
  const startValue =
    isEditing && meta.initialChar !== null
      ? meta.initialChar
      : rawValue(row.original, column.id)

  // Position cursor at end after entering edit mode. Must run unconditionally (hooks rule).
  useEffect(() => {
    if (!isEditing || !inputRef.current) return
    const el = inputRef.current
    el.focus()
    const len = el.value.length
    el.setSelectionRange(len, len)
  }, [isEditing])

  if (!isEditing) {
    return (
      <span className={`block w-full h-full px-2 py-1 text-sm leading-5 ${meta.wrapText ? 'whitespace-normal break-words' : 'truncate'}`}>
        {String(info.getValue() ?? '')}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      defaultValue={startValue}
      className="w-full h-full px-2 py-1 text-sm bg-white outline-none"
      onBlur={(e) => meta.commitCell(row.id, column.id, e.currentTarget.value)}
      onKeyDown={(e) =>
        makeEditKeyHandler(e, row.id, column.id, () => inputRef.current?.value ?? '', meta)
      }
    />
  )
}

function EditableDateCell({ info }: { info: CellContext<Task, string | null> }) {
  const { row, column, table } = info
  const meta = table.options.meta!
  const isEditing =
    meta.editingCell?.rowId === row.id && meta.editingCell.columnId === column.id
  const inputRef = useRef<HTMLInputElement>(null)

  // Printable key on date field: clear value (browser native date picker handles entry)
  const startValue = isEditing && meta.initialChar !== null ? '' : (info.getValue() ?? '')

  if (!isEditing) {
    return (
      <span className={`block w-full h-full px-2 py-1 text-sm leading-5 ${meta.wrapText ? 'whitespace-normal break-words' : ''}`}>
        {formatDate(info.getValue())}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      type="date"
      defaultValue={startValue}
      className="w-full h-full px-2 py-1 text-sm bg-white outline-none"
      onBlur={(e) => meta.commitCell(row.id, column.id, e.currentTarget.value)}
      onKeyDown={(e) =>
        makeEditKeyHandler(e, row.id, column.id, () => inputRef.current?.value ?? '', meta)
      }
    />
  )
}

function EditableProgressCell({ info }: { info: CellContext<Task, number> }) {
  const { row, column, table } = info
  const meta = table.options.meta!
  const isEditing =
    meta.editingCell?.rowId === row.id && meta.editingCell.columnId === column.id
  const inputRef = useRef<HTMLInputElement>(null)

  // Printable digit key: start fresh with that digit; otherwise preserve existing value.
  const startValue =
    isEditing && meta.initialChar !== null ? meta.initialChar : String(info.getValue())

  // Position cursor at end after entering edit mode. Must run unconditionally (hooks rule).
  useEffect(() => {
    if (!isEditing || !inputRef.current) return
    const el = inputRef.current
    el.focus()
    const len = el.value.length
    el.setSelectionRange(len, len)
  }, [isEditing])

  if (!isEditing) {
    return (
      <span className={`block w-full h-full px-2 py-1 text-sm leading-5 ${meta.wrapText ? 'whitespace-normal break-words' : ''}`}>
        {info.getValue()}%
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      type="number"
      min={0}
      max={100}
      defaultValue={startValue}
      className="w-full h-full px-2 py-1 text-sm bg-white outline-none"
      onBlur={(e) => meta.commitCell(row.id, column.id, e.currentTarget.value)}
      onKeyDown={(e) =>
        makeEditKeyHandler(e, row.id, column.id, () => inputRef.current?.value ?? '', meta)
      }
    />
  )
}

function EditableStatusCell({ info }: { info: CellContext<Task, TaskStatus> }) {
  const { row, column, table } = info
  const meta = table.options.meta!
  const status = info.getValue()
  const isEditing =
    meta.editingCell?.rowId === row.id && meta.editingCell.columnId === column.id

  if (!isEditing) {
    return (
      <span className={`block w-full h-full px-2 py-1 cursor-pointer ${meta.wrapText ? 'whitespace-normal' : ''}`}>
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}>
          {STATUS_LABELS[status]}
        </span>
      </span>
    )
  }

  return (
    <select
      autoFocus
      defaultValue={status}
      className="w-full h-full px-2 py-1 text-sm bg-white outline-none"
      onBlur={(e) => meta.commitCell(row.id, column.id, e.currentTarget.value)}
      onChange={(e) => meta.commitCell(row.id, column.id, e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') meta.cancelCell()
      }}
    >
      {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
      ))}
    </select>
  )
}

// ─── Empty row (Excel-style blank row for new-task entry) ─────────────────────

interface EmptyRowProps {
  colSpan: number
  rowIndex: number
  isEditing: boolean
  selectedColumnId: string | null
  onDoubleClick: () => void
  onCommit: (name: string) => Promise<void>
  onCancel: () => void
  onCellClick: (columnId: string) => void
}

function EmptyRow({ colSpan, rowIndex, isEditing, selectedColumnId, onDoubleClick, onCommit, onCancel, onCellClick }: EmptyRowProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isEven = rowIndex % 2 === 0

  const handleCommit = useCallback(async () => {
    const value = inputRef.current?.value.trim() ?? ''
    if (!value) { onCancel(); return }
    await onCommit(value)
  }, [onCommit, onCancel])

  if (isEditing) {
    return (
      <TableRow className={isEven ? 'bg-white' : 'bg-slate-50/60'}>
        {/* Row number cell — empty rows have no WBS number */}
        <td className="p-0 border border-dashed border-slate-300 h-9 w-9 text-center text-xs text-gray-400 select-none" />
        <TableCell className="border border-dashed border-slate-300 p-0 h-9 ring-2 ring-inset ring-indigo-500 bg-white" colSpan={1}>
          <input
            ref={inputRef}
            autoFocus
            placeholder="タスク名を入力"
            className="w-full h-full px-2 py-1 text-sm outline-none"
            onBlur={handleCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                void handleCommit()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onCancel()
              }
            }}
          />
        </TableCell>
        {Array.from({ length: colSpan - 1 }).map((_, i) => (
          <TableCell key={i} className="border border-dashed border-slate-300 h-9" />
        ))}
      </TableRow>
    )
  }

  // Render each column cell individually so clicks can identify which column was clicked
  const columnIds = ['name', 'phase_id', 'status', 'start_date', 'end_date', 'progress', 'updated_at'] as const
  return (
    <TableRow
      className={isEven ? 'bg-white' : 'bg-slate-50/60'}
      onDoubleClick={onDoubleClick}
    >
      {/* Row number cell — empty rows have no WBS number */}
      <td className="p-0 border border-dashed border-slate-300 h-9 w-9 text-center text-xs text-gray-400 select-none" />
      {columnIds.slice(0, colSpan).map((colId) => {
        const isSelected = selectedColumnId === colId
        return (
          <TableCell
            key={colId}
            className={[
              'border border-dashed border-slate-300 h-9 px-2 py-1 text-sm select-none cursor-default',
              isSelected ? 'ring-2 ring-inset ring-indigo-400 bg-indigo-50' : 'hover:bg-indigo-50',
            ].join(' ')}
            onClick={() => onCellClick(colId)}
          >
            &nbsp;
          </TableCell>
        )
      })}
    </TableRow>
  )
}

// ─── Column definitions ───────────────────────────────────────────────────────

const columnHelper = createColumnHelper<Task>()

// ─── Component ────────────────────────────────────────────────────────────────

export function TaskSheet() {
  const phases = useTaskStore((s) => s.phases)
  const storeTasks = useTaskStore((s) => s.tasks)
  const upsertTask = useTaskStore((s) => s.upsertTask)
  const removeTask = useTaskStore((s) => s.removeTask)
  const permissions = usePermissions()
  const currentUserId = useProjectStore((s) => s.currentUserId)
  const currentProject = useProjectStore((s) => s.currentProject)
  const tasks = useVendorFilter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; columnId: string } | null>(null)
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null)
  // Range selection: anchor is the fixed corner, head tracks the moving corner (Shift+Click / Shift+Arrow)
  const [selectionAnchor, setSelectionAnchor] = useState<{ rowId: string; columnId: string } | null>(null)
  const [selectionHead, setSelectionHead] = useState<{ rowId: string; columnId: string } | null>(null)
  // Index of the empty row currently in edit mode (null = none)
  const [editingEmptyRowIndex, setEditingEmptyRowIndex] = useState<number | null>(null)
  // Selected empty row (for single-click selection and paste origin)
  const [selectedEmptyRow, setSelectedEmptyRow] = useState<{ rowIndex: number; columnId: string } | null>(null)
  // Extra empty rows added by the "+ 10行追加" button
  const [extraEmptyRows, setExtraEmptyRows] = useState(0)
  // Tracks the printable character that triggered edit mode (null = F2 / double-click)
  const [initialChar, setInitialChar] = useState<string | null>(null)
  // Ref to the focusable table container so we can receive keyboard events when a cell is selected
  const tableRef = useRef<HTMLDivElement>(null)
  // WBS number column drag-selection flag
  const isWbsDraggingRef = useRef(false)
  // Text always wraps (no toggle)
  const wrapText = true
  // Mirror editingCell in a ref so useUndoRedo's isEditing getter always reads the latest value
  const editingCellRef = useRef(editingCell)
  editingCellRef.current = editingCell

  const { pushCommand, undo, redo, canUndo, canRedo } = useUndoRedo(() => editingCellRef.current !== null)

  // Derive the set of "rowId:columnId" keys that form the current rectangular selection range.
  // Returns null when there is no multi-cell range (anchor === head, or either is missing).
  const selectionRange = useMemo((): Set<string> | null => {
    if (!selectionAnchor || !selectionHead) return null
    const anchorRowIdx = tasks.findIndex((t) => t.id === selectionAnchor.rowId)
    const headRowIdx   = tasks.findIndex((t) => t.id === selectionHead.rowId)
    const anchorColIdx = COLUMN_ORDER.indexOf(selectionAnchor.columnId as typeof COLUMN_ORDER[number])
    const headColIdx   = COLUMN_ORDER.indexOf(selectionHead.columnId as typeof COLUMN_ORDER[number])
    if (anchorRowIdx === -1 || headRowIdx === -1 || anchorColIdx === -1 || headColIdx === -1) return null
    const minRow = Math.min(anchorRowIdx, headRowIdx)
    const maxRow = Math.max(anchorRowIdx, headRowIdx)
    const minCol = Math.min(anchorColIdx, headColIdx)
    const maxCol = Math.max(anchorColIdx, headColIdx)
    // A single-cell range is not meaningful; caller should just use selectedCell
    if (minRow === maxRow && minCol === maxCol) return null
    const keys = new Set<string>()
    for (let r = minRow; r <= maxRow; r++) {
      const task = tasks[r]
      if (!task) continue
      for (let c = minCol; c <= maxCol; c++) {
        const col = COLUMN_ORDER[c]
        if (col) keys.add(`${task.id}:${col}`)
      }
    }
    return keys.size > 0 ? keys : null
  }, [selectionAnchor, selectionHead, tasks])
  // TSV clipboard for cell-level Cmd+C/X/V (mirrors GanttLeftPanel behaviour)
  const tsvClipboardRef = useRef<string>('')
  // Ref so that navigateCell (inside useCallback) can read the latest emptyRowCount without re-creating
  const emptyRowCountRef = useRef(0)
  // Context menu state (right-click on task row)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowId: string } | null>(null)

  const phaseMap = useMemo(() => new Map(phases.map((p) => [p.id, p.name])), [phases])

  const canEditTask = useCallback(
    (task: Task): boolean => {
      if (!currentUserId) return permissions.canEdit
      return canVendorEditTask(permissions, task.vendor_id ?? null, currentUserId)
    },
    [permissions, currentUserId],
  )

  const selectCell = useCallback(
    (rowId: string, columnId: string) => {
      if (!EDITABLE_COLUMNS.has(columnId as typeof COLUMN_ORDER[number])) return
      if (rowId.startsWith('__empty__')) {
        // Delegate to the empty-row selection path
        const emptyIndex = parseInt(rowId.slice('__empty__'.length), 10)
        if (isNaN(emptyIndex)) return
        setSelectedEmptyRow({ rowIndex: emptyIndex, columnId })
        setSelectedCell(null)
        setEditingCell(null)
        setInitialChar(null)
        tableRef.current?.focus()
        return
      }
      const task = tasks.find((t) => t.id === rowId)
      if (!task) return
      setSelectedCell({ rowId, columnId })
      setSelectedEmptyRow(null)
      setEditingCell(null)
      setInitialChar(null)
      setSelectionAnchor(null)
      setSelectionHead(null)
      // Keep focus on the container so keyboard events keep working
      tableRef.current?.focus()
    },
    [tasks],
  )

  // Select a cell in an empty row (single click; canEdit must be true at call site)
  const selectEmptyCell = useCallback((rowIndex: number, columnId: string) => {
    setSelectedEmptyRow({ rowIndex, columnId })
    setSelectedCell(null)
    setEditingCell(null)
    setInitialChar(null)
    tableRef.current?.focus()
  }, [])

  // Enter edit mode on a cell (double-click, F2, or printable keypress)
  const editCell = useCallback(
    (rowId: string, columnId: string, char?: string) => {
      const task = tasks.find((t) => t.id === rowId)
      if (!task || !canEditTask(task) || !EDITABLE_COLUMNS.has(columnId as typeof COLUMN_ORDER[number])) return
      setSelectedCell({ rowId, columnId })
      setEditingCell({ rowId, columnId })
      setInitialChar(char ?? null)
    },
    [tasks, canEditTask],
  )

  // Cancel edit: return to selected state
  const cancelCell = useCallback(() => {
    setEditingCell(null)
    setInitialChar(null)
    tableRef.current?.focus()
  }, [])

  // Navigate selection/editing to adjacent cell.
  // openEditOnArrive=true immediately enters edit mode on the destination cell (Tab/Enter in edit).
  const navigateCell = useCallback(
    (rowId: string, columnId: string, direction: 'next' | 'prev' | 'up' | 'down', openEditOnArrive = false) => {
      const colIndex = COLUMN_ORDER.indexOf(columnId as typeof COLUMN_ORDER[number])
      const rowIndex = tasks.findIndex((t) => t.id === rowId)
      if (rowIndex === -1) return

      let nextColIndex = colIndex
      let nextRowIndex = rowIndex

      switch (direction) {
        case 'next':
          nextColIndex = colIndex + 1
          if (nextColIndex >= COLUMN_ORDER.length) {
            nextColIndex = 0
            nextRowIndex = rowIndex + 1
          }
          break
        case 'prev':
          nextColIndex = colIndex - 1
          if (nextColIndex < 0) {
            nextColIndex = COLUMN_ORDER.length - 1
            nextRowIndex = rowIndex - 1
          }
          break
        case 'down':
          nextRowIndex = rowIndex + 1
          break
        case 'up':
          nextRowIndex = rowIndex - 1
          break
      }

      if (nextRowIndex < 0) {
        setEditingCell(null)
        setInitialChar(null)
        setSelectedCell(null)
        return
      }

      // When navigating past the last task row, move into the empty rows area
      if (nextRowIndex >= tasks.length && emptyRowCountRef.current > 0) {
        setEditingCell(null)
        setInitialChar(null)
        setSelectedCell(null)
        // Use column as-is when moving down into empty rows
        const emptyColId = COLUMN_ORDER[nextColIndex] ?? columnId
        setSelectedEmptyRow({ rowIndex: 0, columnId: emptyColId })
        tableRef.current?.focus()
        return
      }

      if (nextRowIndex >= tasks.length) {
        setEditingCell(null)
        setInitialChar(null)
        setSelectedCell(null)
        return
      }

      const nextTask = tasks[nextRowIndex]
      const nextColumn = COLUMN_ORDER[nextColIndex]

      setSelectedCell({ rowId: nextTask.id, columnId: nextColumn })
      setSelectedEmptyRow(null)
      setInitialChar(null)
      setSelectionAnchor(null)
      setSelectionHead(null)

      if (openEditOnArrive) {
        // Enter edit mode on the destination cell (matches GanttLeftPanel Tab/Enter behaviour)
        setEditingCell({ rowId: nextTask.id, columnId: nextColumn })
      } else {
        setEditingCell(null)
        tableRef.current?.focus()
      }
    },
    // emptyRowCountRef is a ref so it doesn't cause stale closure issues
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks],
  )

  const commitCell = useCallback(
    async (rowId: string, columnId: string, rawInput: string) => {
      setEditingCell(null)
      setInitialChar(null)

      const task = tasks.find((t) => t.id === rowId)
      if (!task) return

      type EditablePayload = {
        id: string
        version: number
        name?: string
        status?: TaskStatus
        start_date?: string | null
        end_date?: string | null
        progress?: number
      }

      const patch: EditablePayload = { id: task.id, version: task.version }
      // Capture before value for undo
      let beforeValue: string | number | null = null
      let afterValue: string | number | null = null

      switch (columnId) {
        case 'name':
          if (!rawInput.trim() || rawInput.trim() === task.name) return
          beforeValue = task.name
          afterValue = rawInput.trim()
          patch.name = rawInput.trim()
          break
        case 'status':
          if (rawInput === task.status) return
          beforeValue = task.status
          afterValue = rawInput
          patch.status = rawInput as TaskStatus
          break
        case 'start_date':
          patch.start_date = rawInput || null
          if (patch.start_date === task.start_date) return
          beforeValue = task.start_date
          afterValue = patch.start_date
          break
        case 'end_date':
          patch.end_date = rawInput || null
          if (patch.end_date === task.end_date) return
          beforeValue = task.end_date
          afterValue = patch.end_date
          break
        case 'progress': {
          const n = Math.min(100, Math.max(0, parseInt(rawInput, 10)))
          if (isNaN(n) || n === task.progress) return
          beforeValue = task.progress
          afterValue = n
          patch.progress = n
          break
        }
        default:
          return
      }

      // Record before committing so undo has the correct pre-change state
      pushCommand({ taskId: rowId, field: columnId, before: beforeValue, after: afterValue })

      // Optimistic update
      upsertTask({ ...task, ...patch })

      try {
        const res = await fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })

        if (!res.ok) {
          upsertTask(task)
          return
        }

        const json = await res.json() as { data: Task }
        upsertTask(json.data)
      } catch {
        upsertTask(task)
      }
    },
    [tasks, upsertTask, pushCommand],
  )

  // Clear a single cell value and persist via API (Delete/Backspace key)
  const clearCell = useCallback(
    async (rowId: string, columnId: string) => {
      if (columnId === 'name') return // name is required; cannot be cleared
      const task = tasks.find((t) => t.id === rowId)
      if (!task || !canEditTask(task)) return

      type ClearPayload = {
        id: string
        version: number
        status?: TaskStatus
        start_date?: null
        end_date?: null
        progress?: number
      }

      const patch: ClearPayload = { id: task.id, version: task.version }
      let beforeValue: string | number | null = null
      let afterValue: string | number | null = null

      switch (columnId) {
        case 'status':
          beforeValue = task.status
          afterValue = 'not_started'
          patch.status = 'not_started'
          break
        case 'start_date':
          beforeValue = task.start_date
          afterValue = null
          patch.start_date = null
          break
        case 'end_date':
          beforeValue = task.end_date
          afterValue = null
          patch.end_date = null
          break
        case 'progress':
          beforeValue = task.progress
          afterValue = 0
          patch.progress = 0
          break
        default: return
      }

      pushCommand({ taskId: rowId, field: columnId, before: beforeValue, after: afterValue })
      upsertTask({ ...task, ...patch })

      try {
        const res = await fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        if (res.ok) {
          const json = await res.json() as { data: Task }
          upsertTask(json.data)
        } else {
          upsertTask(task)
        }
      } catch {
        upsertTask(task)
      }
    },
    [tasks, canEditTask, upsertTask, pushCommand],
  )

  // Delete a task by ID without confirmation
  const deleteTaskById = useCallback(
    async (rowId: string) => {
      const task = tasks.find((t) => t.id === rowId)
      if (!task || !canEditTask(task)) return

      const hasChildren = storeTasks.some((t) => t.parent_task_id === rowId)

      // Optimistic removal
      removeTask(rowId)
      if (hasChildren) {
        // Remove child tasks optimistically as well
        storeTasks.filter((t) => t.parent_task_id === rowId).forEach((t) => removeTask(t.id))
      }

      try {
        const res = await fetch(`/api/tasks?id=${encodeURIComponent(rowId)}`, { method: 'DELETE' })
        if (!res.ok) {
          // Roll back: re-fetch would be ideal but upsertTask the original is simpler
          upsertTask(task)
        }
      } catch {
        upsertTask(task)
      }

      if (selectedCell?.rowId === rowId) setSelectedCell(null)
    },
    [tasks, storeTasks, canEditTask, removeTask, upsertTask, selectedCell],
  )

  const handleNewTask = useCallback(
    async (name: string) => {
      if (!currentProject) return

      const body = {
        project_id: currentProject.id,
        phase_id: phases[0]?.id ?? null,
        name,
        status: 'not_started' as TaskStatus,
        progress: 0,
        display_order: storeTasks.length,
      }

      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!res.ok) return

        const json = await res.json() as { data: Task }
        upsertTask(json.data)
        return json.data
      } catch {
        // Network failure — no optimistic add for new tasks to avoid phantom rows
      }
      return undefined
    },
    [currentProject, phases, storeTasks.length, upsertTask],
  )

  // Paste TSV into empty rows starting at emptyRowIndex.
  // Rows that map to existing empty rows will create new tasks row-by-row.
  // Only the first column of the TSV is used as the task name (no multi-column expansion into empty rows).
  const handlePasteIntoEmpty = useCallback(
    async (text: string, emptyRowIndex: number) => {
      if (!currentProject || !permissions.canEdit) return
      // Preserve blank lines so paste row positions match source positions.
      // Each line maps 1:1 to an empty row slot; blank lines just leave that slot empty.
      const lines = text.split('\n')
      // Determine how many empty rows are available from emptyRowIndex onward
      const available = emptyRowCountRef.current - emptyRowIndex
      const limit = Math.min(lines.length, available)
      for (let i = 0; i < limit; i++) {
        const cols = (lines[i] ?? '').split('\t')
        const name = cols[0]?.trim() ?? ''
        if (!name) continue
        // Build a PATCH payload for the remaining columns if present
        const created = await handleNewTask(name)
        if (!created) continue
        type PatchCols = { status?: TaskStatus; start_date?: string | null; end_date?: string | null; progress?: number }
        const extra: PatchCols = {}
        const colMap: typeof COLUMN_ORDER[number][] = ['name', 'status', 'start_date', 'end_date', 'progress']
        for (let c = 1; c < cols.length && c < colMap.length; c++) {
          const col = colMap[c]
          const val = cols[c] ?? ''
          switch (col) {
            case 'status': {
              const valid: TaskStatus[] = ['not_started', 'in_progress', 'completed', 'blocked']
              if (valid.includes(val as TaskStatus)) extra.status = val as TaskStatus
              break
            }
            case 'start_date':
              extra.start_date = val || null
              break
            case 'end_date':
              extra.end_date = val || null
              break
            case 'progress': {
              const n = parseInt(val, 10)
              if (!isNaN(n)) extra.progress = Math.min(100, Math.max(0, n))
              break
            }
          }
        }
        if (Object.keys(extra).length > 0) {
          const patch = { id: created.id, version: created.version, ...extra }
          upsertTask({ ...created, ...extra })
          try {
            const res = await fetch('/api/tasks', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patch),
            })
            if (res.ok) {
              const json = await res.json() as { data: Task }
              upsertTask(json.data)
            } else {
              upsertTask(created)
            }
          } catch {
            upsertTask(created)
          }
        }
      }
    },
    [currentProject, permissions.canEdit, handleNewTask, upsertTask],
  )

  // Write text to clipboard with execCommand fallback for non-secure contexts
  const writeClipboard = useCallback(async (text: string) => {
    tsvClipboardRef.current = text
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }, [])

  // Reset WBS drag flag on mouseup anywhere in the document
  useEffect(() => {
    const onMouseUp = () => { isWbsDraggingRef.current = false }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])

  // Handle keyboard events on the table container when a cell is selected but not editing.
  // This implements Excel-style: arrow keys move, F2 enters edit mode, printable keys replace content.
  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (editingCell) return

      // Ctrl+Home / Ctrl+End: jump to data boundary regardless of current selection state
      {
        const isMod = e.ctrlKey || e.metaKey
        if (isMod && e.key === 'Home') {
          e.preventDefault()
          if (tasks.length > 0) {
            const firstTask = tasks[0]
            const firstCol = COLUMN_ORDER[0]
            setSelectedCell({ rowId: firstTask.id, columnId: firstCol })
            setSelectedEmptyRow(null)
            setSelectionAnchor(null)
            setSelectionHead(null)
          }
          return
        }
        if (isMod && e.key === 'End') {
          e.preventDefault()
          if (tasks.length > 0) {
            const lastTask = tasks[tasks.length - 1]
            const lastCol = COLUMN_ORDER[COLUMN_ORDER.length - 1]
            setSelectedCell({ rowId: lastTask.id, columnId: lastCol })
            setSelectedEmptyRow(null)
            setSelectionAnchor(null)
            setSelectionHead(null)
          }
          return
        }
      }

      // ─── Empty-row keyboard handling ─────────────────────────────────────────
      if (!selectedCell && selectedEmptyRow) {
        const { rowIndex, columnId } = selectedEmptyRow
        const colIndex = COLUMN_ORDER.indexOf(columnId as typeof COLUMN_ORDER[number])
        const isMod = e.ctrlKey || e.metaKey

        if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (rowIndex > 0) {
            setSelectedEmptyRow({ rowIndex: rowIndex - 1, columnId })
          } else if (tasks.length > 0) {
            // Move back into the last task row
            const lastTask = tasks[tasks.length - 1]
            setSelectedEmptyRow(null)
            setSelectedCell({ rowId: lastTask.id, columnId })
          }
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (rowIndex < emptyRowCountRef.current - 1) {
            setSelectedEmptyRow({ rowIndex: rowIndex + 1, columnId })
          }
          return
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          if (colIndex < COLUMN_ORDER.length - 1) {
            setSelectedEmptyRow({ rowIndex, columnId: COLUMN_ORDER[colIndex + 1] })
          }
          return
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          if (colIndex > 0) {
            setSelectedEmptyRow({ rowIndex, columnId: COLUMN_ORDER[colIndex - 1] })
          }
          return
        }
        // Double-click action via Enter/F2: open edit mode for the empty row
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault()
          setEditingEmptyRowIndex(rowIndex)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setSelectedEmptyRow(null)
          return
        }
        // Cmd+V: paste TSV into empty rows — create new tasks for each line
        if (isMod && e.key === 'v') {
          e.preventDefault()
          navigator.clipboard.readText().then((t) => void handlePasteIntoEmpty(t, rowIndex)).catch(() => {
            void handlePasteIntoEmpty(tsvClipboardRef.current, rowIndex)
          })
          return
        }
        // Printable key while an empty row is selected → open the empty row editor
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          setEditingEmptyRowIndex(rowIndex)
          return
        }
        return
      }

      // When a whole-row range is selected (WBS click) but no individual cell is focused,
      // handle Cmd+C/X/Delete for the range and Escape to clear selection.
      if (!selectedCell && selectionRange && selectionAnchor && selectionHead) {
        const isMod2 = e.ctrlKey || e.metaKey

        if (isMod2 && (e.key === 'Delete' || e.key === 'Backspace')) {
          e.preventDefault()
          if (permissions.canEdit) {
            // Delete all rows covered by the range
            const rowIdsToDelete = new Set<string>()
            selectionRange.forEach((key) => {
              const colonIdx = key.indexOf(':')
              if (colonIdx !== -1) rowIdsToDelete.add(key.slice(0, colonIdx))
            })
            for (const id of rowIdsToDelete) void deleteTaskById(id)
            setSelectionAnchor(null)
            setSelectionHead(null)
          }
          return
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          selectionRange.forEach((key) => {
            const [cellRowId, cellColId] = key.split(':')
            if (cellRowId && cellColId) void clearCell(cellRowId, cellColId)
          })
          return
        }

        if (isMod2 && e.key === 'c') {
          e.preventDefault()
          const anchorRowIdx = tasks.findIndex((t) => t.id === selectionAnchor.rowId)
          const headRowIdx   = tasks.findIndex((t) => t.id === selectionHead.rowId)
          const anchorColIdx = COLUMN_ORDER.indexOf(selectionAnchor.columnId as typeof COLUMN_ORDER[number])
          const headColIdx   = COLUMN_ORDER.indexOf(selectionHead.columnId as typeof COLUMN_ORDER[number])
          const minRow = Math.min(anchorRowIdx, headRowIdx)
          const maxRow = Math.max(anchorRowIdx, headRowIdx)
          const minCol = Math.min(anchorColIdx, headColIdx)
          const maxCol = Math.max(anchorColIdx, headColIdx)
          const lines: string[] = []
          for (let r = minRow; r <= maxRow; r++) {
            const task = tasks[r]
            if (!task) continue
            const cells: string[] = []
            for (let c = minCol; c <= maxCol; c++) {
              const col = COLUMN_ORDER[c]
              if (col) cells.push(rawValue(task, col))
            }
            lines.push(cells.join('\t'))
          }
          void writeClipboard(lines.join('\n'))
          return
        }

        if (isMod2 && e.key === 'x') {
          e.preventDefault()
          const anchorRowIdx = tasks.findIndex((t) => t.id === selectionAnchor.rowId)
          const headRowIdx   = tasks.findIndex((t) => t.id === selectionHead.rowId)
          const anchorColIdx = COLUMN_ORDER.indexOf(selectionAnchor.columnId as typeof COLUMN_ORDER[number])
          const headColIdx   = COLUMN_ORDER.indexOf(selectionHead.columnId as typeof COLUMN_ORDER[number])
          const minRow = Math.min(anchorRowIdx, headRowIdx)
          const maxRow = Math.max(anchorRowIdx, headRowIdx)
          const minCol = Math.min(anchorColIdx, headColIdx)
          const maxCol = Math.max(anchorColIdx, headColIdx)
          const lines: string[] = []
          for (let r = minRow; r <= maxRow; r++) {
            const task = tasks[r]
            if (!task) continue
            const cells: string[] = []
            for (let c = minCol; c <= maxCol; c++) {
              const col = COLUMN_ORDER[c]
              if (col) cells.push(rawValue(task, col))
            }
            lines.push(cells.join('\t'))
          }
          void writeClipboard(lines.join('\n'))
          selectionRange.forEach((key) => {
            const [cellRowId, cellColId] = key.split(':')
            if (cellRowId && cellColId && cellColId !== 'name') {
              const task = tasks.find((t) => t.id === cellRowId)
              if (task && canEditTask(task)) void clearCell(cellRowId, cellColId)
            }
          })
          return
        }

        if (e.key === 'Escape') {
          e.preventDefault()
          setSelectionAnchor(null)
          setSelectionHead(null)
          return
        }

        return
      }

      if (!selectedCell) return

      const { rowId, columnId } = selectedCell
      const isMod = e.ctrlKey || e.metaKey

      // Cmd+Delete: delete the task row (with confirmation)
      if (isMod && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        if (permissions.canEdit) void deleteTaskById(rowId)
        return
      }

      // Delete / Backspace (no modifier): clear selected cell(s)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        if (selectionRange && selectionRange.size > 0) {
          // Clear all cells in the range (skipping name; clearCell handles that guard too)
          selectionRange.forEach((key) => {
            const [cellRowId, cellColId] = key.split(':')
            if (cellRowId && cellColId) void clearCell(cellRowId, cellColId)
          })
        } else {
          void clearCell(rowId, columnId)
        }
        return
      }

      // Cmd+C: copy selected cell(s) as TSV (range-aware)
      if (isMod && e.key === 'c') {
        e.preventDefault()
        if (selectionRange && selectionAnchor && selectionHead) {
          // Copy the rectangular range as TSV
          const anchorRowIdx = tasks.findIndex((t) => t.id === selectionAnchor.rowId)
          const headRowIdx   = tasks.findIndex((t) => t.id === selectionHead.rowId)
          const anchorColIdx = COLUMN_ORDER.indexOf(selectionAnchor.columnId as typeof COLUMN_ORDER[number])
          const headColIdx   = COLUMN_ORDER.indexOf(selectionHead.columnId as typeof COLUMN_ORDER[number])
          const minRow = Math.min(anchorRowIdx, headRowIdx)
          const maxRow = Math.max(anchorRowIdx, headRowIdx)
          const minCol = Math.min(anchorColIdx, headColIdx)
          const maxCol = Math.max(anchorColIdx, headColIdx)
          const lines: string[] = []
          for (let r = minRow; r <= maxRow; r++) {
            const task = tasks[r]
            if (!task) continue
            const cells: string[] = []
            for (let c = minCol; c <= maxCol; c++) {
              const col = COLUMN_ORDER[c]
              if (col) cells.push(rawValue(task, col))
            }
            lines.push(cells.join('\t'))
          }
          void writeClipboard(lines.join('\n'))
        } else {
          const task = tasks.find((t) => t.id === rowId)
          if (task) void writeClipboard(rawValue(task, columnId))
        }
        return
      }

      // Cmd+X: copy and clear selected cell(s) (range-aware)
      if (isMod && e.key === 'x') {
        e.preventDefault()
        if (selectionRange && selectionAnchor && selectionHead) {
          // Copy range as TSV, then clear non-name cells
          const anchorRowIdx = tasks.findIndex((t) => t.id === selectionAnchor.rowId)
          const headRowIdx   = tasks.findIndex((t) => t.id === selectionHead.rowId)
          const anchorColIdx = COLUMN_ORDER.indexOf(selectionAnchor.columnId as typeof COLUMN_ORDER[number])
          const headColIdx   = COLUMN_ORDER.indexOf(selectionHead.columnId as typeof COLUMN_ORDER[number])
          const minRow = Math.min(anchorRowIdx, headRowIdx)
          const maxRow = Math.max(anchorRowIdx, headRowIdx)
          const minCol = Math.min(anchorColIdx, headColIdx)
          const maxCol = Math.max(anchorColIdx, headColIdx)
          const lines: string[] = []
          for (let r = minRow; r <= maxRow; r++) {
            const task = tasks[r]
            if (!task) continue
            const cells: string[] = []
            for (let c = minCol; c <= maxCol; c++) {
              const col = COLUMN_ORDER[c]
              if (col) cells.push(rawValue(task, col))
            }
            lines.push(cells.join('\t'))
          }
          void writeClipboard(lines.join('\n'))
          // Clear non-name cells in the range
          selectionRange.forEach((key) => {
            const [cellRowId, cellColId] = key.split(':')
            if (cellRowId && cellColId && cellColId !== 'name') {
              const task = tasks.find((t) => t.id === cellRowId)
              if (task && canEditTask(task)) void clearCell(cellRowId, cellColId)
            }
          })
        } else {
          const task = tasks.find((t) => t.id === rowId)
          if (task && canEditTask(task)) {
            void writeClipboard(rawValue(task, columnId))
            void clearCell(rowId, columnId)
          }
        }
        return
      }

      // Cmd+V: paste TSV into selected cell
      if (isMod && e.key === 'v') {
        e.preventDefault()
        const task = tasks.find((t) => t.id === rowId)
        if (!task || !canEditTask(task)) return
        const doPaste = (text: string) => {
          // Single-cell paste: take top-left cell of TSV
          const value = text.split('\n')[0]?.split('\t')[0] ?? ''
          // name column: skip empty values (RBAC check + empty guard)
          if (columnId === 'name' && !value.trim()) return
          void commitCell(rowId, columnId, value)
        }
        navigator.clipboard.readText().then(doPaste).catch(() => {
          // Fall back to in-memory clipboard if browser API is unavailable
          doPaste(tsvClipboardRef.current)
        })
        return
      }

      // Arrow key navigation (Shift+Arrow extends the selection range)
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const dir = e.key === 'ArrowRight' ? 'next'
          : e.key === 'ArrowLeft' ? 'prev'
          : e.key === 'ArrowDown' ? 'down'
          : 'up'
        if (e.shiftKey) {
          // Extend range: anchor stays fixed, head advances in arrow direction
          const currentHead = selectionHead ?? { rowId, columnId }
          const headColIdx = COLUMN_ORDER.indexOf(currentHead.columnId as typeof COLUMN_ORDER[number])
          const headRowIdx = tasks.findIndex((t) => t.id === currentHead.rowId)
          if (headRowIdx === -1 || headColIdx === -1) return
          let nextHeadRowIdx = headRowIdx
          let nextHeadColIdx = headColIdx
          if (dir === 'next')  nextHeadColIdx = Math.min(headColIdx + 1, COLUMN_ORDER.length - 1)
          if (dir === 'prev')  nextHeadColIdx = Math.max(headColIdx - 1, 0)
          if (dir === 'down')  nextHeadRowIdx = Math.min(headRowIdx + 1, tasks.length - 1)
          if (dir === 'up')    nextHeadRowIdx = Math.max(headRowIdx - 1, 0)
          const nextHeadTask = tasks[nextHeadRowIdx]
          const nextHeadCol = COLUMN_ORDER[nextHeadColIdx]
          if (!nextHeadTask || !nextHeadCol) return
          if (!selectionAnchor) setSelectionAnchor({ rowId, columnId })
          setSelectionHead({ rowId: nextHeadTask.id, columnId: nextHeadCol })
        } else {
          // Normal arrow: clear range and move selectedCell
          setSelectionAnchor(null)
          setSelectionHead(null)
          navigateCell(rowId, columnId, dir)
        }
        return
      }

      // Tab: move selection
      if (e.key === 'Tab') {
        e.preventDefault()
        navigateCell(rowId, columnId, e.shiftKey ? 'prev' : 'next')
        return
      }

      // Enter / F2: enter edit mode preserving content (Excel / GanttLeftPanel behaviour)
      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault()
        editCell(rowId, columnId)
        return
      }

      // Escape: deselect and clear range
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedCell(null)
        setSelectionAnchor(null)
        setSelectionHead(null)
        return
      }

      // Printable character: start editing.
      // IME入力中（e.isComposing または e.key === 'Process'）の場合はセル内容をクリアせず
      // フォーカスのみ当てて IME が正常に動作するようにする
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.nativeEvent.isComposing || e.key === 'Process') {
          // IME composition: open edit preserving existing content so IME can compose normally
          editCell(rowId, columnId)
        } else {
          e.preventDefault()
          editCell(rowId, columnId, e.key)
        }
      }
    },
    [selectedCell, selectedEmptyRow, editingCell, selectionRange, selectionAnchor, selectionHead, navigateCell, editCell, tasks, canEditTask, commitCell, writeClipboard, handlePasteIntoEmpty, clearCell, deleteTaskById, permissions.canEdit],
  )

  const columns = useMemo(() => [
    columnHelper.accessor('name', {
      header: 'タスク名',
      cell: (info) => (
        <span className={info.row.original.parent_task_id ? 'pl-6 block' : 'block'}>
          <EditableTextCell info={info} />
        </span>
      ),
    }),
    columnHelper.accessor('phase_id', {
      header: 'フェーズ',
      enableSorting: false,
      cell: (info) => {
        const id = info.getValue()
        return (
          <span className="block px-2 py-1 text-sm text-slate-600">
            {id ? (phaseMap.get(id) ?? '—') : '—'}
          </span>
        )
      },
    }),
    columnHelper.accessor('status', {
      header: 'ステータス',
      cell: (info) => <EditableStatusCell info={info} />,
    }),
    columnHelper.accessor('start_date', {
      header: '開始日',
      cell: (info) => <EditableDateCell info={info} />,
    }),
    columnHelper.accessor('end_date', {
      header: '終了日',
      cell: (info) => <EditableDateCell info={info} />,
    }),
    columnHelper.accessor('progress', {
      header: '進捗',
      cell: (info) => <EditableProgressCell info={info} />,
    }),
    columnHelper.accessor('updated_at', {
      header: '更新日',
      cell: (info) => (
        <span className="block px-2 py-1 text-sm text-slate-500">
          {formatDate(info.getValue())}
        </span>
      ),
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [phaseMap])

  const table = useReactTable({
    data: tasks,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: {
      selectedCell,
      editingCell,
      initialChar,
      wrapText,
      selectCell,
      editCell,
      commitCell,
      cancelCell,
      navigateCell,
    },
    getRowId: (row) => row.id,
  })

  const rows = table.getRowModel().rows

  // Compute WBS numbers keyed by task id based on phase grouping (same logic as GanttLeftPanel).
  // Phase order matches display_order; tasks within each phase follow their rendered order.
  const wbsNumberMap = useMemo(
    () => buildWbsNumberMap(tasks, phases),
    [tasks, phases]
  )

  // Number of empty rows to display so that task rows + empty rows = at least 20.
  // Extra rows are appended by the "+ 10行追加" button.
  const MIN_TOTAL_ROWS = 20
  const emptyRowCount = permissions.canEdit
    ? Math.max(MIN_TOTAL_ROWS - rows.length, 0) + extraEmptyRows
    : 0

  // Keep the ref in sync so navigateCell / handleTableKeyDown can read it without stale closures
  emptyRowCountRef.current = emptyRowCount

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white flex-shrink-0">
        <button
          type="button"
          disabled={!canUndo}
          onClick={undo}
          title="元に戻す (Cmd+Z)"
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={redo}
          title="やり直し (Cmd+Shift+Z)"
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* tabIndex makes the div focusable so it can receive keyboard events for selected-cell navigation */}
      <div
        ref={tableRef}
        className="flex-1 overflow-auto outline-none"
        tabIndex={0}
        onKeyDown={handleTableKeyDown}
      >
      <Table className="border-collapse text-sm">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="bg-slate-50">
              {/* Row number column header */}
              <TableHead className="border border-slate-300 px-1 py-2 text-xs font-semibold text-slate-400 bg-slate-50 select-none w-9 text-center">
                #
              </TableHead>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                const colId = header.column.id
                const isSelectableCol = EDITABLE_COLUMNS.has(colId as typeof COLUMN_ORDER[number])
                return (
                  <TableHead
                    key={header.id}
                    onClick={(e) => {
                      // Column-wide selection: select all rows in this column
                      if (isSelectableCol && tasks.length > 0) {
                        const firstTask = tasks[0]
                        const lastTask = tasks[tasks.length - 1]
                        setSelectedCell({ rowId: firstTask.id, columnId: colId })
                        setSelectionAnchor({ rowId: firstTask.id, columnId: colId })
                        setSelectionHead({ rowId: lastTask.id, columnId: colId })
                        setEditingCell(null)
                        setInitialChar(null)
                        tableRef.current?.focus()
                      }
                      // Also toggle sorting (existing behaviour)
                      header.column.getToggleSortingHandler()?.(e)
                    }}
                    className={[
                      'border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 bg-slate-50 select-none',
                      header.column.getCanSort() || isSelectableCol ? 'cursor-pointer hover:bg-indigo-50' : '',
                    ].join(' ')}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sorted === 'asc' && <ChevronUp className="h-3 w-3" />}
                      {sorted === 'desc' && <ChevronDown className="h-3 w-3" />}
                      {sorted === false && header.column.getCanSort() && (
                        <ChevronsUpDown className="h-3 w-3 text-slate-300" />
                      )}
                    </span>
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              {/* +1 for the row number column */}
              <TableCell
                colSpan={columns.length + 1}
                className="h-16 text-center text-slate-400 border border-slate-200"
              >
                タスクがありません
              </TableCell>
            </TableRow>
          )}
          {rows.map((row, rowIndex) => {
            const isEven = rowIndex % 2 === 0
            return (
              <TableRow
                key={row.id}
                className={isEven ? 'bg-white' : 'bg-slate-50/60'}
                onClick={() => setSelectedEmptyRow(null)}
                onContextMenu={
                  permissions.canEdit && canEditTask(row.original)
                    ? (e) => {
                        e.preventDefault()
                        setContextMenu({ x: e.clientX, y: e.clientY, rowId: row.id })
                      }
                    : undefined
                }
              >
                {/* Row number cell — clicking selects the entire row; dragging extends the range */}
                <td
                  className="p-0 border border-slate-200 h-9 w-9 text-center text-xs text-gray-400 select-none px-1 cursor-pointer hover:bg-indigo-100"
                  onMouseDown={(e) => {
                    if (e.button !== 0) return
                    // Prevent text selection during drag
                    e.preventDefault()
                    e.stopPropagation()
                    const firstCol = COLUMN_ORDER[0]
                    const lastCol = COLUMN_ORDER[COLUMN_ORDER.length - 1]
                    const isMod = e.ctrlKey || e.metaKey
                    setSelectedEmptyRow(null)
                    setEditingCell(null)
                    setInitialChar(null)
                    setSelectedCell(null)

                    if (e.shiftKey && selectionAnchor) {
                      // Shift+click: extend existing anchor to this row
                      setSelectionHead({ rowId: row.id, columnId: lastCol })
                      tableRef.current?.focus()
                      return
                    }

                    if (isMod && (selectionAnchor || selectedCell)) {
                      // Cmd+click: extend range to span from existing anchor to this row
                      const currentAnchorRowId = selectionAnchor?.rowId ?? selectedCell?.rowId ?? null
                      if (currentAnchorRowId) {
                        const anchorIdx = tasks.findIndex((t) => t.id === currentAnchorRowId)
                        const currentIdx = tasks.findIndex((t) => t.id === row.id)
                        if (anchorIdx !== -1 && currentIdx !== -1) {
                          const lo = Math.min(anchorIdx, currentIdx)
                          const hi = Math.max(anchorIdx, currentIdx)
                          setSelectionAnchor({ rowId: tasks[lo].id, columnId: firstCol })
                          setSelectionHead({ rowId: tasks[hi].id, columnId: lastCol })
                          tableRef.current?.focus()
                          return
                        }
                      }
                    }

                    // Plain mousedown: start drag from this row
                    isWbsDraggingRef.current = true
                    setSelectionAnchor({ rowId: row.id, columnId: firstCol })
                    setSelectionHead({ rowId: row.id, columnId: lastCol })
                    tableRef.current?.focus()
                  }}
                  onMouseEnter={() => {
                    if (!isWbsDraggingRef.current) return
                    const lastCol = COLUMN_ORDER[COLUMN_ORDER.length - 1]
                    setSelectionHead({ rowId: row.id, columnId: lastCol })
                  }}
                >
                  {wbsNumberMap.get(row.id) ?? String(rowIndex + 1)}
                </td>
                {row.getVisibleCells().map((cell) => {
                  const colId = cell.column.id
                  const isEditable =
                    EDITABLE_COLUMNS.has(colId as typeof COLUMN_ORDER[number]) &&
                    canEditTask(row.original)
                  const isSelected =
                    selectedCell?.rowId === row.id && selectedCell.columnId === colId
                  const isEditing =
                    editingCell?.rowId === row.id && editingCell.columnId === colId
                  const inRange = selectionRange?.has(`${row.id}:${colId}`) ?? false
                  const cellClassName = inRange && !isEditing
                    ? 'p-0 border border-slate-200 h-9 ring-2 ring-inset ring-indigo-400 bg-indigo-50'
                    : cellClass(isSelected, isEditing, isEditable)
                  return (
                    <TableCell
                      key={cell.id}
                      className={cellClassName}
                      // Single click: Shift extends range, normal click selects
                      onClick={
                        isEditable
                          ? (e) => {
                              if (e.shiftKey && selectedCell) {
                                // Keep existing anchor (or set it from selectedCell first time)
                                setSelectionAnchor((prev) => prev ?? selectedCell)
                                setSelectionHead({ rowId: row.id, columnId: colId })
                              } else {
                                selectCell(row.id, colId)
                              }
                            }
                          : undefined
                      }
                      // Double click → edit
                      onDoubleClick={
                        isEditable
                          ? () => editCell(row.id, colId)
                          : undefined
                      }
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
          {Array.from({ length: emptyRowCount }).map((_, i) => (
            <EmptyRow
              key={`empty-${i}`}
              colSpan={columns.length}
              rowIndex={rows.length + i}

              isEditing={editingEmptyRowIndex === i}
              selectedColumnId={
                selectedEmptyRow?.rowIndex === i ? selectedEmptyRow.columnId : null
              }
              onDoubleClick={() => {
                setEditingEmptyRowIndex(i)
                setSelectedEmptyRow(null)
              }}
              onCommit={async (name) => {
                setEditingEmptyRowIndex(null)
                await handleNewTask(name)
              }}
              onCancel={() => setEditingEmptyRowIndex(null)}
              onCellClick={(colId) => {
                if (!permissions.canEdit) return
                setSelectedEmptyRow({ rowIndex: i, columnId: colId })
                setSelectedCell(null)
                setEditingCell(null)
                setInitialChar(null)
                tableRef.current?.focus()
              }}
            />
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center gap-4 px-2 py-1">
        {permissions.canEdit && (
          <button
            type="button"
            className="text-slate-400 hover:text-slate-600 text-sm"
            onClick={() => setExtraEmptyRows((n) => n + 10)}
          >
            + 10行追加
          </button>
        )}
      </div>

      {contextMenu != null && (
        <SheetContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onCopyRow={() => {
            const task = tasks.find((t) => t.id === contextMenu.rowId)
            setContextMenu(null)
            if (!task) return
            // Build TSV for all editable columns of this row
            const tsv = COLUMN_ORDER.map((col) => rawValue(task, col)).join('\t')
            void writeClipboard(tsv)
            // Also set the selection range to the whole row so Cmd+V can paste correctly
            setSelectionAnchor({ rowId: task.id, columnId: COLUMN_ORDER[0] })
            setSelectionHead({ rowId: task.id, columnId: COLUMN_ORDER[COLUMN_ORDER.length - 1] })
            setSelectedCell(null)
          }}
          onCutRow={() => {
            const task = tasks.find((t) => t.id === contextMenu.rowId)
            setContextMenu(null)
            if (!task || !permissions.canEdit) return
            const tsv = COLUMN_ORDER.map((col) => rawValue(task, col)).join('\t')
            void writeClipboard(tsv)
            // Clear non-name columns
            const cols: typeof COLUMN_ORDER[number][] = ['status', 'start_date', 'end_date', 'progress']
            for (const col of cols) {
              void clearCell(task.id, col)
            }
          }}
          onDeleteTask={() => {
            const rowId = contextMenu.rowId
            setContextMenu(null)
            void deleteTaskById(rowId)
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
      </div>
    </div>
  )
}

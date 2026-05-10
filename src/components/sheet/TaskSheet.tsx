'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type CellContext,
} from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { useTaskStore } from '@/store/taskStore'
import { useProjectStore } from '@/store/projectStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useVendorFilter } from '@/hooks/useVendorFilter'
import { canVendorEditTask } from '@/types/rbac'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Task, TaskStatus } from '@/types'

// ─── Module augmentation for typed table meta ─────────────────────────────────

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData> {
    selectedCell: { rowId: string; columnId: string } | null
    editingCell: { rowId: string; columnId: string } | null
    /** initialChar: when entering edit mode via printable key, the character to pre-fill */
    initialChar: string | null
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
  return iso.slice(0, 10).replace(/-/g, '/')
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
      <span className="block w-full h-full px-2 py-1 text-sm leading-5 truncate">
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
      <span className="block w-full h-full px-2 py-1 text-sm leading-5">
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
      <span className="block w-full h-full px-2 py-1 text-sm leading-5">
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
      <span className="block w-full h-full px-2 py-1 cursor-pointer">
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
  const permissions = usePermissions()
  const currentUserId = useProjectStore((s) => s.currentUserId)
  const currentProject = useProjectStore((s) => s.currentProject)
  const tasks = useVendorFilter()
  const [sorting, setSorting] = useState<SortingState>([])
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; columnId: string } | null>(null)
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null)
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
  // TSV clipboard for cell-level Cmd+C/X/V (mirrors GanttLeftPanel behaviour)
  const tsvClipboardRef = useRef<string>('')
  // Ref so that navigateCell (inside useCallback) can read the latest emptyRowCount without re-creating
  const emptyRowCountRef = useRef(0)

  const phaseMap = new Map(phases.map((p) => [p.id, p.name]))

  const canEditTask = useCallback(
    (task: Task): boolean => {
      if (!currentUserId) return permissions.canEdit
      return canVendorEditTask(permissions, task.vendor_id ?? null, currentUserId)
    },
    [permissions, currentUserId],
  )

  // Select a cell without entering edit mode (single click).
  // Accepts both real task rowIds and "__empty__N" virtual row ids.
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

      switch (columnId) {
        case 'name':
          if (!rawInput.trim() || rawInput.trim() === task.name) return
          patch.name = rawInput.trim()
          break
        case 'status':
          if (rawInput === task.status) return
          patch.status = rawInput as TaskStatus
          break
        case 'start_date':
          patch.start_date = rawInput || null
          if (patch.start_date === task.start_date) return
          break
        case 'end_date':
          patch.end_date = rawInput || null
          if (patch.end_date === task.end_date) return
          break
        case 'progress': {
          const n = Math.min(100, Math.max(0, parseInt(rawInput, 10)))
          if (isNaN(n) || n === task.progress) return
          patch.progress = n
          break
        }
        default:
          return
      }

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
    [tasks, upsertTask],
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
      } catch {
        // Network failure — no optimistic add for new tasks to avoid phantom rows
      }
    },
    [currentProject, phases, storeTasks.length, upsertTask],
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

  // Handle keyboard events on the table container when a cell is selected but not editing.
  // This implements Excel-style: arrow keys move, F2 enters edit mode, printable keys replace content.
  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (editingCell) return

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
        // Cmd+V: paste into empty row — create a new task then patch it
        if (isMod && e.key === 'v') {
          e.preventDefault()
          const doPaste = async (text: string) => {
            const value = text.split('\n')[0]?.split('\t')[0]?.trim() ?? ''
            if (!value) return
            await handleNewTask(value)
          }
          navigator.clipboard.readText().then((t) => void doPaste(t)).catch(() => {
            void doPaste(tsvClipboardRef.current)
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

      if (!selectedCell) return

      const { rowId, columnId } = selectedCell
      const isMod = e.ctrlKey || e.metaKey

      // Cmd+C: copy selected cell value as TSV
      if (isMod && e.key === 'c') {
        e.preventDefault()
        const task = tasks.find((t) => t.id === rowId)
        if (task) void writeClipboard(rawValue(task, columnId))
        return
      }

      // Cmd+X: copy and clear selected cell
      if (isMod && e.key === 'x') {
        e.preventDefault()
        const task = tasks.find((t) => t.id === rowId)
        if (task && canEditTask(task)) {
          void writeClipboard(rawValue(task, columnId))
          // Clear the cell by committing an empty/default value
          const defaultVal = columnId === 'progress' ? '0' : ''
          void commitCell(rowId, columnId, defaultVal)
        }
        return
      }

      // Cmd+V: paste TSV into selected cell
      if (isMod && e.key === 'v') {
        e.preventDefault()
        const task = tasks.find((t) => t.id === rowId)
        if (!task || !canEditTask(task)) return
        const doPaste = (text: string) => {
          // Only single-cell paste for sheet view (no range selection)
          const value = text.split('\n')[0]?.split('\t')[0] ?? ''
          void commitCell(rowId, columnId, value)
        }
        navigator.clipboard.readText().then(doPaste).catch(() => {
          // Fall back to in-memory clipboard if browser API is unavailable
          doPaste(tsvClipboardRef.current)
        })
        return
      }

      // Arrow key navigation
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        navigateCell(rowId, columnId, 'next')
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        navigateCell(rowId, columnId, 'prev')
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        navigateCell(rowId, columnId, 'down')
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        navigateCell(rowId, columnId, 'up')
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

      // Escape: deselect
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedCell(null)
        return
      }

      // Printable character: clear cell and start editing with this character.
      // We detect printable keys by checking key length === 1 (single char) and no modifier.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        editCell(rowId, columnId, e.key)
      }
    },
    [selectedCell, selectedEmptyRow, editingCell, navigateCell, editCell, tasks, canEditTask, commitCell, writeClipboard, handleNewTask],
  )

  const columns = [
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
  ]

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
      selectCell,
      editCell,
      commitCell,
      cancelCell,
      navigateCell,
    },
    getRowId: (row) => row.id,
  })

  const rows = table.getRowModel().rows

  // Number of empty rows to display so that task rows + empty rows = at least 20.
  // Extra rows are appended by the "+ 10行追加" button.
  const MIN_TOTAL_ROWS = 20
  const emptyRowCount = permissions.canEdit
    ? Math.max(MIN_TOTAL_ROWS - rows.length, 0) + extraEmptyRows
    : 0

  // Keep the ref in sync so navigateCell / handleTableKeyDown can read it without stale closures
  emptyRowCountRef.current = emptyRowCount

  return (
    // tabIndex makes the div focusable so it can receive keyboard events for selected-cell navigation
    <div
      ref={tableRef}
      className="h-full overflow-auto outline-none"
      tabIndex={0}
      onKeyDown={handleTableKeyDown}
    >
      <Table className="border-collapse text-sm">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="bg-slate-50">
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                return (
                  <TableHead
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={[
                      'border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 bg-slate-50 select-none',
                      header.column.getCanSort() ? 'cursor-pointer' : '',
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
              <TableCell
                colSpan={columns.length}
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
              >
                {row.getVisibleCells().map((cell) => {
                  const colId = cell.column.id
                  const isEditable =
                    EDITABLE_COLUMNS.has(colId as typeof COLUMN_ORDER[number]) &&
                    canEditTask(row.original)
                  const isSelected =
                    selectedCell?.rowId === row.id && selectedCell.columnId === colId
                  const isEditing =
                    editingCell?.rowId === row.id && editingCell.columnId === colId
                  return (
                    <TableCell
                      key={cell.id}
                      className={cellClass(isSelected, isEditing, isEditable)}
                      // Single click → select
                      onClick={
                        isEditable
                          ? () => selectCell(row.id, colId)
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
      {permissions.canEdit && (
        <div className="flex justify-start px-2 py-1">
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
  )
}

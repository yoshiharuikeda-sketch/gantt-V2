'use client'

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { format, parseISO } from '@/lib/utils/dateUtils'
import { useTaskStore } from '@/store/taskStore'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { canVendorEditTask } from '@/types/rbac'
import { TaskDetailModal } from '@/components/task/TaskDetailModal'
import type { UndoCommand } from '@/hooks/useUndoRedo'
import { buildWbsNumberMap } from '@/lib/utils/taskTree'
import type { TaskWithBaseline, GanttColKey, UserPermissions } from '@/types'
import type { Task, Phase } from '@/types'

const DEFAULT_COL_WIDTHS: Record<GanttColKey, number> = {
  name:       180,
  start_date: 90,
  end_date:   90,
  progress:   70,
  vendor:     100,
  updated_at: 100,
}

const COL_LABELS: Record<GanttColKey, string> = {
  name:       'タスク名',
  start_date: '開始日',
  end_date:   '終了日',
  progress:   '進捗率',
  vendor:     'ベンダー',
  updated_at: '更新日',
}

const LOCAL_STORAGE_COL_WIDTHS_KEY = 'gantt-column-widths'

function loadColWidths(): Record<GanttColKey, number> {
  if (typeof window === 'undefined') return { ...DEFAULT_COL_WIDTHS }
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_COL_WIDTHS_KEY)
    if (!stored) return { ...DEFAULT_COL_WIDTHS }
    const parsed = JSON.parse(stored) as Partial<Record<GanttColKey, number>>
    return {
      name:       typeof parsed.name       === 'number' ? parsed.name       : DEFAULT_COL_WIDTHS.name,
      start_date: typeof parsed.start_date === 'number' ? parsed.start_date : DEFAULT_COL_WIDTHS.start_date,
      end_date:   typeof parsed.end_date   === 'number' ? parsed.end_date   : DEFAULT_COL_WIDTHS.end_date,
      progress:   typeof parsed.progress   === 'number' ? parsed.progress   : DEFAULT_COL_WIDTHS.progress,
      vendor:     typeof parsed.vendor     === 'number' ? parsed.vendor     : DEFAULT_COL_WIDTHS.vendor,
      updated_at: typeof parsed.updated_at === 'number' ? parsed.updated_at : DEFAULT_COL_WIDTHS.updated_at,
    }
  } catch {
    return { ...DEFAULT_COL_WIDTHS }
  }
}

// Columns that cannot be directly edited in the inline cell
const NON_EDITABLE_COLS = new Set<GanttColKey>(['vendor', 'updated_at'])

function fmtDate(val: string | null | undefined): string {
  if (!val) return '-'
  try { return format(parseISO(val), 'yy/MM/dd') } catch { return '-' }
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
  pushCommand: (cmd: UndoCommand) => void
  /** Called with true when a cell enters edit mode, false when it exits */
  onEditingChange: (isEditing: boolean) => void
  /** Called whenever the primary selected row changes (null = deselected) */
  onSelectedRowChange?: (taskId: string | null) => void
  /** Width of the left panel container (from the drag divider). Used to compute dynamic name column width. */
  containerWidth: number
}

// ─── PhaseRow ─────────────────────────────────────────────────────────────────

interface PhaseRowProps {
  phase: Phase
  rowHeight: number
  columns: GanttColKey[]
  colWidths: Record<GanttColKey, number>
  wbsNumber: string
  aggStart: string | null
  aggEnd: string | null
  aggProgress: number
  isSelected: boolean
  isEditing: boolean
  editValue: string
  onEditValueChange: (v: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  onNameDoubleClick: () => void
  onRowSelect: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onWbsClick?: (e: React.MouseEvent) => void
  onWbsMouseDown?: (e: React.MouseEvent) => void
  onWbsMouseEnter?: () => void
  // セル選択
  selectedCol: GanttColKey | null
  onCellClick: (col: GanttColKey, e: React.MouseEvent) => void
  onCellMouseDown: (col: GanttColKey, e: React.MouseEvent) => void
  // 折りたたみ
  isCollapsed: boolean
  onToggleCollapse: () => void
}

function PhaseRow({
  phase,
  rowHeight,
  columns,
  colWidths,
  wbsNumber,
  aggStart,
  aggEnd,
  aggProgress,
  isSelected,
  isEditing,
  editValue,
  onEditValueChange,
  onCommitEdit,
  onCancelEdit,
  onNameDoubleClick,
  onRowSelect,
  onContextMenu,
  onWbsClick,
  onWbsMouseDown,
  onWbsMouseEnter,
  selectedCol,
  onCellClick,
  onCellMouseDown,
  isCollapsed,
  onToggleCollapse,
}: PhaseRowProps) {
  const baseRowBg = isSelected ? 'bg-indigo-100' : 'bg-slate-100'

  return (
    <div
      className={`flex items-center border-b border-slate-200 select-none ${baseRowBg}`}
      style={{ height: rowHeight }}
      onClick={onRowSelect}
      onContextMenu={onContextMenu}
    >
      {/* Phase color bar — 4px left border */}
      <div
        className="flex-shrink-0"
        style={{ width: 4, height: '100%', backgroundColor: phase.color }}
      />
      {/* WBS number cell — 32px wide; combined with the 4px color bar = 36px total, matching TaskRow */}
      <div
        className={`flex-shrink-0 flex items-center justify-center border-r border-slate-200 px-1 ${onWbsClick ? 'cursor-pointer hover:bg-indigo-100' : ''}`}
        style={{ width: 32, height: '100%' }}
        onClick={(e) => {
          e.stopPropagation()
          onWbsClick?.(e)
        }}
        onMouseDown={(e) => {
          e.stopPropagation()
          onWbsMouseDown?.(e)
        }}
        onMouseEnter={onWbsMouseEnter}
      >
        <span className="text-xs font-bold text-slate-400 select-none truncate">{wbsNumber}</span>
      </div>
      {/* Column cells */}
      {columns.map((col) => {
        let content: React.ReactNode = null
        if (col === 'name') {
          // Collapse toggle button lives inside the name cell to keep the WBS zone at 36px (4+32),
          // matching TaskRow's 36px WBS cell and preserving column alignment.
          const toggleBtn = (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
              className="flex-shrink-0 flex items-center justify-center w-4 h-full text-slate-400 hover:text-slate-600 mr-1"
              title={isCollapsed ? '展開' : '折りたたむ'}
            >
              {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )
          content = isEditing ? (
            <>
              {toggleBtn}
              <input
                autoFocus
                type="text"
                value={editValue}
                onChange={(e) => onEditValueChange(e.target.value)}
                onBlur={onCommitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.preventDefault(); onCancelEdit(); return }
                  if (e.key === 'Enter') { e.preventDefault(); onCommitEdit(); return }
                }}
                className="w-full text-xs font-bold bg-transparent border-none outline-none text-slate-700"
                onClick={(e) => e.stopPropagation()}
              />
            </>
          ) : (
            <>
              {toggleBtn}
              <span className="text-xs font-bold text-slate-700 truncate">{phase.name}</span>
            </>
          )
        } else if (col === 'start_date') {
          content = <span className="text-xs text-slate-500 truncate">{fmtDate(aggStart)}</span>
        } else if (col === 'end_date') {
          content = <span className="text-xs text-slate-500 truncate">{fmtDate(aggEnd)}</span>
        } else if (col === 'progress') {
          content = <span className="text-xs text-slate-500 truncate">{aggProgress}%</span>
        } else {
          content = null
        }

        // vendor / updated_at: no cell selection (empty cells, row-select only)
        const isCellSelectable = col === 'name' || col === 'start_date' || col === 'end_date' || col === 'progress'
        const isCellSelected = selectedCol === col

        return (
          <div
            key={col}
            className={[
              'flex-shrink-0 flex items-center border-r border-slate-200 overflow-hidden',
              isCellSelectable && isCellSelected ? 'ring-2 ring-inset ring-indigo-400 bg-indigo-50' : '',
              col === 'name' && !isEditing ? 'cursor-pointer' : isCellSelectable ? 'cursor-default' : '',
            ].filter(Boolean).join(' ')}
            style={{ width: colWidths[col], height: '100%', paddingLeft: col === 'name' ? 4 : 8, paddingRight: 8 }}
            onDoubleClick={col === 'name' ? (e) => { e.stopPropagation(); onNameDoubleClick() } : undefined}
            onClick={(e) => {
              e.stopPropagation()
              if (isCellSelectable) onCellClick(col, e)
            }}
            onMouseDown={(e) => {
              if (isCellSelectable) onCellMouseDown(col, e)
            }}
          >
            {content}
          </div>
        )
      })}
    </div>
  )
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: TaskWithBaseline
  rowHeight: number
  columns: GanttColKey[]
  colWidths: Record<GanttColKey, number>
  rowIndex: number
  wbsNumber: string
  activeCell: ActiveCell | null
  selectedCell: CellId | null
  selectionRange: Set<string> | null
  editValue: string
  isSelected: boolean
  wrapText: boolean
  isInRowClipboard: boolean
  rowClipboardMode: 'copy' | 'cut' | null
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
  onWbsClick: (taskId: string, e: React.MouseEvent) => void
  onWbsMouseDown: (taskId: string, e: React.MouseEvent) => void
  onWbsMouseEnter: (taskId: string) => void
}

function TaskRow({
  task,
  rowHeight,
  columns,
  colWidths,
  rowIndex,
  wbsNumber,
  activeCell,
  selectedCell,
  selectionRange,
  editValue,
  isSelected,
  wrapText,
  isInRowClipboard,
  rowClipboardMode,
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
  onWbsClick,
  onWbsMouseDown,
  onWbsMouseEnter,
}: TaskRowProps) {
  const baseRowBg = isSelected
    ? 'bg-indigo-100'
    : rowIndex % 2 === 0
      ? 'bg-white'
      : 'bg-slate-50'

  // Marching-ants class for clipboard rows
  const clipboardClass = isInRowClipboard
    ? rowClipboardMode === 'cut'
      ? 'marching-ants-cut'
      : 'marching-ants-copy'
    : ''

  return (
    <div
      className={`flex items-center border-b border-slate-200 transition-colors ${baseRowBg} hover:bg-blue-50 ${clipboardClass}`}
      style={{ height: rowHeight }}
      onClick={(e) => onRowSelect(task.id, e)}
      onContextMenu={(e) => onContextMenu(e, task.id)}
    >

      <div
        className="flex-shrink-0 flex items-center justify-center border-r border-slate-200 px-1 cursor-pointer hover:bg-indigo-100"
        style={{ width: 36, height: '100%' }}
        onClick={(e) => {
          e.stopPropagation()
          onWbsClick(task.id, e)
        }}
        onMouseDown={(e) => {
          e.stopPropagation()
          onWbsMouseDown(task.id, e)
        }}
        onMouseEnter={() => onWbsMouseEnter(task.id)}
      >
        <span className="text-xs text-slate-400 select-none truncate">{wbsNumber}</span>
      </div>
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
              width: colWidths[col],
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
              <span className={`text-xs text-slate-700 w-full ${wrapText ? 'whitespace-normal break-words' : 'truncate'}`}>
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
  colWidths: Record<GanttColKey, number>
  rowIndex: number
  isEditing: boolean
  editValue: string
  selectedCol: GanttColKey | null
  onEditValueChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
  onDoubleClick: () => void
  onCellClick: (col: GanttColKey) => void
  onContextMenu: (e: React.MouseEvent) => void
}

function EmptyRow({
  rowHeight,
  columns,
  colWidths,
  rowIndex,
  isEditing,
  editValue,
  selectedCol,
  onEditValueChange,
  onCommit,
  onCancel,
  onDoubleClick,
  onCellClick,
  onContextMenu,
}: EmptyRowProps) {
  const baseRowBg = rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'

  return (
    <div
      className={`flex items-center ${baseRowBg} hover:bg-blue-50 transition-colors`}
      style={{ height: rowHeight }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >

      <div
        className="flex-shrink-0 flex items-center justify-center border-r border-dashed border-slate-300"
        style={{ width: 36, height: '100%' }}
      >
        {/* Empty rows have no WBS number; show nothing in the row number cell */}
      </div>
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
              width: colWidths[col],
              height: '100%',
              paddingLeft: 8,
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
  hasRowClipboard: boolean
  rowClipboardMode: 'copy' | 'cut' | null
  onInsertAbove: () => void
  onInsertBelow: () => void
  onCopy: () => void
  onCut: () => void
  onPaste: () => void
  onPasteAbove: () => void
  onPasteBelow: () => void
  onDelete: () => void
}

function ContextMenu({
  x,
  y,
  canEdit,
  hasClipboard,
  hasRowClipboard,
  rowClipboardMode,
  onInsertAbove,
  onInsertBelow,
  onCopy,
  onCut,
  onPaste,
  onPasteAbove,
  onPasteBelow,
  onDelete,
}: ContextMenuProps) {
  type MenuItem = {
    label: string
    shortcut?: string
    onClick: () => void
    disabled: boolean
    dividerAfter?: boolean
  }

  const menuItems: MenuItem[] = []

  if (hasRowClipboard) {
    // When row clipboard is active, show paste-insert options at the top
    const pasteLabel = rowClipboardMode === 'cut' ? '切り取った行を' : 'コピーした行を'
    menuItems.push(
      { label: `${pasteLabel}上に挿入`, onClick: onPasteAbove, disabled: !canEdit },
      { label: `${pasteLabel}下に挿入`, onClick: onPasteBelow, disabled: !canEdit, dividerAfter: true },
    )
  }

  menuItems.push(
    { label: '行を上に挿入', onClick: onInsertAbove, disabled: !canEdit },
    { label: '行を下に挿入', onClick: onInsertBelow, disabled: !canEdit },
    { label: 'コピー', shortcut: 'Ctrl+C', onClick: onCopy, disabled: !canEdit },
    { label: '切り取り', shortcut: 'Ctrl+X', onClick: onCut, disabled: !canEdit },
    { label: '貼り付け', shortcut: 'Ctrl+V', onClick: onPaste, disabled: !canEdit || !hasClipboard },
    { label: '削除', shortcut: 'Delete', onClick: onDelete, disabled: !canEdit },
  )

  return (
    <div
      className="fixed z-50 bg-white border border-slate-200 rounded shadow-lg py-1 min-w-[180px]"
      style={{ left: x, top: y }}
      // Prevent the document click handler from firing immediately for this element
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item, i) => (
        <React.Fragment key={i}>
          <button
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
          {item.dividerAfter && (
            <div className="border-t border-slate-100 my-1" />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

// ─── PhaseContextMenu ─────────────────────────────────────────────────────────

function PhaseContextMenu({ x, y, canEdit, isUnassigned, onRename, onDelete, onConvertToTask }: {
  x: number; y: number; canEdit: boolean; isUnassigned: boolean
  onRename: () => void; onDelete: () => void; onConvertToTask: () => void
}) {
  const items = [
    { label: 'フェーズ名を変更', onClick: onRename, disabled: !canEdit || isUnassigned },
    { label: 'タスクに戻す', onClick: onConvertToTask, disabled: !canEdit || isUnassigned },
    { label: 'フェーズを削除', onClick: onDelete, disabled: !canEdit },
  ]
  return (
    <div
      className="fixed z-50 bg-white border border-slate-200 rounded shadow-lg py-1 min-w-[180px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button key={i} disabled={item.disabled} onClick={item.onClick}
          className={['w-full flex items-center px-3 py-1.5 text-xs text-left',
            item.disabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-indigo-50 cursor-pointer'].join(' ')}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

// ─── GanttLeftPanel ───────────────────────────────────────────────────────────

// Flat list entry used for rendering: a phase header or a task row
type RowEntry =
  | { kind: 'phase'; phase: Phase; wbsNumber: string; aggStart: string | null; aggEnd: string | null; aggProgress: number }
  | { kind: 'task'; task: TaskWithBaseline; visualIndex: number; wbsNumber: string }

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

export function GanttLeftPanel({ tasks, rowHeight, columns, permissions, pushCommand, onEditingChange, onSelectedRowChange, containerWidth }: GanttLeftPanelProps) {
  const currentUserId = useProjectStore((s) => s.currentUserId)
  const currentProject = useProjectStore((s) => s.currentProject)
  const upsertTask = useTaskStore((s) => s.upsertTask)
  const removeTask = useTaskStore((s) => s.removeTask)
  const storeTasks = useTaskStore((s) => s.tasks)
  const phases = useTaskStore((s) => s.phases)
  const collapsedPhaseIds = useUiStore((s) => s.collapsedPhaseIds)
  const togglePhaseCollapse = useUiStore((s) => s.togglePhaseCollapse)
  const reorderTasks = useTaskStore((s) => s.reorderTasks)
  const upsertPhase = useTaskStore((s) => s.upsertPhase)
  const removePhase = useTaskStore((s) => s.removePhase)

  // Column widths — loaded from localStorage so they survive page reloads
  const [colWidths, setColWidths] = useState<Record<GanttColKey, number>>(loadColWidths)

  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null)
  const [selectedCell, setSelectedCell] = useState<CellId | null>(null)
  const [editValue, setEditValue] = useState('')

  // Cell drag-selection state
  const [selectionAnchor, setSelectionAnchor] = useState<CellId | null>(null)
  const [selectionHead, setSelectionHead] = useState<CellId | null>(null)
  const isDraggingCellsRef = useRef(false)
  // WBS number column drag-selection (separate from cell drag)
  const isWbsDraggingRef = useRef(false)
  // Set when WBS onMouseDown fires to suppress the subsequent onClick (which would reset the drag selection)
  const suppressNextWbsClickRef = useRef(false)
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
  // Track whether the OS clipboard has cell-level TSV content written by this component.
  // Used to enable the "貼り付け" item in the empty-row context menu.
  const hasCellClipboardRef = useRef(false)

  // Row-level clipboard for Excel-like Ctrl+C/Ctrl+X row copy/cut
  // Distinct from the cell-level `clipboard` above (which is for context-menu paste into same row).
  const [rowClipboard, setRowClipboard] = useState<{
    rows: TaskWithBaseline[]
    mode: 'copy' | 'cut'
  } | null>(null)

  // Context menu for task rows
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string } | null>(null)
  // Context menu for empty rows (shows "タスクを追加" only)
  const [emptyRowContextMenu, setEmptyRowContextMenu] = useState<{ x: number; y: number; rowIndex: number } | null>(null)

  // Phase 行選択
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null)
  // フェーズセル選択
  const [selectedPhaseCell, setSelectedPhaseCell] = useState<{ phaseId: string; col: GanttColKey } | null>(null)
  // Phase インライン編集
  const [activePhaseName, setActivePhaseName] = useState<{ phaseId: string } | null>(null)
  const [phaseEditValue, setPhaseEditValue] = useState('')
  // Phase コンテキストメニュー
  const [phaseContextMenu, setPhaseContextMenu] = useState<{ x: number; y: number; phaseId: string } | null>(null)

  // Index of the empty row currently in edit mode (null = none)
  const [editingEmptyRowIndex, setEditingEmptyRowIndex] = useState<number | null>(null)
  const [emptyRowValue, setEmptyRowValue] = useState('')
  // Extra empty rows added by the "+ 10行追加" button
  const [extraEmptyRows, setExtraEmptyRows] = useState(0)
  // Text always wraps (no toggle)
  const wrapText = true
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

  // Notify parent whenever edit mode starts or stops so it can update its isEditing check
  useEffect(() => {
    onEditingChange(activeCell !== null)
  }, [activeCell, onEditingChange])

  // Notify parent whenever the primary selected row changes
  useEffect(() => {
    onSelectedRowChange?.(selectedRowId)
  }, [selectedRowId, onSelectedRowChange])

  // pushCommand is provided by the parent (GanttChart) which owns the shared undo/redo stack
  const editValueRef = useRef('')
  const tasksRef = useRef<TaskWithBaseline[]>(tasks)

  // Refs for delete-related state so deleteRow always sees the latest values
  // without causing stale closures in the document keydown handler
  const selectedRowIdsRef = useRef<Set<string>>(new Set())
  const selectedRowIdRef = useRef<string | null>(null)
  const selectionRangeRef = useRef<Set<string> | null>(null)

  // ─── Phase grouping ──────────────────────────────────────────────────────────

  // Build a flat list of rows: phase headers interleaved with task rows.
  // Tasks with no phase go into an "未分類" group at the end.
  // Each entry carries a WBS number reflecting the phase/task hierarchy.
  const rows: RowEntry[] = useMemo(() => {
    const sortedPhases = [...phases].sort((a, b) => a.display_order - b.display_order)
    const result: RowEntry[] = []
    let visualIndex = 0
    let phaseCounter = 0

    // Pre-compute WBS numbers for all real tasks using the shared utility.
    const wbsNumberMap = buildWbsNumberMap(tasks, phases)

    const buildPhaseEntries = (phaseTasks: TaskWithBaseline[]) => {
      for (const task of phaseTasks) {
        result.push({ kind: 'task', task, visualIndex, wbsNumber: wbsNumberMap.get(task.id) ?? '' })
        visualIndex++
      }
    }

    const computeAgg = (phaseTasks: TaskWithBaseline[]) => {
      if (phaseTasks.length === 0) return { aggStart: null, aggEnd: null, aggProgress: 0 }
      const starts = phaseTasks.map((t) => t.start_date).filter((d): d is string => !!d)
      const ends = phaseTasks.map((t) => t.end_date).filter((d): d is string => !!d)
      const aggStart = starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : null
      const aggEnd = ends.length > 0 ? ends.reduce((a, b) => (a > b ? a : b)) : null
      const aggProgress = Math.round(phaseTasks.reduce((sum, t) => sum + t.progress, 0) / phaseTasks.length)
      return { aggStart, aggEnd, aggProgress }
    }

    for (const phase of sortedPhases) {
      const phaseTasks = tasks.filter((t) => t.phase_id === phase.id)
      phaseCounter++
      const phasePrefix = String(phaseCounter)
      const { aggStart, aggEnd, aggProgress } = computeAgg(phaseTasks)
      result.push({ kind: 'phase', phase, wbsNumber: phasePrefix, aggStart, aggEnd, aggProgress })
      buildPhaseEntries(phaseTasks)
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
      phaseCounter++
      const phasePrefix = String(phaseCounter)
      const { aggStart, aggEnd, aggProgress } = computeAgg(unassigned)
      result.push({ kind: 'phase', phase: unassignedPhase, wbsNumber: phasePrefix, aggStart, aggEnd, aggProgress })
      buildPhaseEntries(unassigned)
    }

    return result
  }, [tasks, phases])

  // 折りたたまれたフェーズのタスク行を除外した表示用リスト
  const visibleRows = useMemo(() =>
    rows.filter((row) => {
      if (row.kind === 'task') {
        const phaseId = row.task.phase_id ?? '__unassigned__'
        return !collapsedPhaseIds.has(phaseId)
      }
      return true // phase行は常に表示
    }),
  [rows, collapsedPhaseIds])

  const detailTask = detailTaskId != null
    ? storeTasks.find((t) => t.id === detailTaskId) ?? null
    : null

  const ROW_NUM_WIDTH = 36
  const MIN_NAME_WIDTH = 80

  // Dynamically compute name column width so the panel fills exactly `containerWidth`
  // (the drag-divider position). Other fixed columns keep their stored widths.
  const effectiveColWidths = useMemo<Record<GanttColKey, number>>(() => {
    const otherWidth = columns
      .filter((c) => c !== 'name')
      .reduce((sum, c) => sum + colWidths[c], 0)
    const available = containerWidth - ROW_NUM_WIDTH - otherWidth
    const dynamicNameWidth = Math.max(available, MIN_NAME_WIDTH)
    return { ...colWidths, name: dynamicNameWidth }
  }, [containerWidth, columns, colWidths])

  const totalWidth = ROW_NUM_WIDTH + columns.reduce((sum, key) => sum + effectiveColWidths[key], 0)

  // Persist column widths to localStorage whenever they change.
  // name is excluded because it's dynamically computed from containerWidth.
  useEffect(() => {
    const persisted: Partial<Record<GanttColKey, number>> = {}
    for (const key of Object.keys(colWidths) as GanttColKey[]) {
      if (key !== 'name') persisted[key] = colWidths[key]
    }
    localStorage.setItem(LOCAL_STORAGE_COL_WIDTHS_KEY, JSON.stringify(persisted))
  }, [colWidths])

  // Column resize drag state
  const colResizingRef = useRef<{ col: GanttColKey; startX: number; startWidth: number } | null>(null)

  const handleColResizeMouseDown = useCallback((col: GanttColKey, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    colResizingRef.current = { col, startX: e.clientX, startWidth: colWidths[col] }
  }, [colWidths])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!colResizingRef.current) return
      const { col, startX, startWidth } = colResizingRef.current
      const delta = e.clientX - startX
      const newWidth = Math.max(40, startWidth + delta)
      setColWidths((prev) => ({ ...prev, [col]: newWidth }))
    }
    const onMouseUp = () => { colResizingRef.current = null }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const canEditTask = useCallback((task: TaskWithBaseline): boolean => {
    if (!permissions) return false
    if (!currentUserId) return permissions.canEdit
    return canVendorEditTask(permissions, task.vendor_id ?? null, currentUserId)
  }, [permissions, currentUserId])

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
    let beforeValue: string | number | null = null
    let afterValue: string | number | null = null

    if (field === 'name') {
      const trimmed = currentValue.trim()
      if (trimmed) {
        beforeValue = task.name
        afterValue = trimmed
        payload.name = trimmed
      }
    } else if (field === 'start_date') {
      beforeValue = task.start_date
      afterValue = currentValue || null
      payload.start_date = currentValue || null
    } else if (field === 'end_date') {
      beforeValue = task.end_date
      afterValue = currentValue || null
      payload.end_date = currentValue || null
    } else if (field === 'progress') {
      const n = parseInt(currentValue, 10)
      if (!isNaN(n)) {
        beforeValue = task.progress
        afterValue = Math.min(100, Math.max(0, n))
        payload.progress = afterValue
      }
    }

    if (Object.keys(payload).length <= 2) {
      committingRef.current = false
      return
    }

    // Record undo command before the API call so the stack is always consistent
    pushCommand({ taskId, field, before: beforeValue, after: afterValue })

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
  }, [upsertTask, pushCommand])

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
    // Escape in edit mode should also clear the row-level clipboard immediately
    setRowClipboard(null)
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

    const lastPhase = phases.length > 0
      ? [...phases].sort((a, b) => a.display_order - b.display_order).at(-1)
      : null
    const lastPhaseId = lastPhase?.id ?? null

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: currentProject.id,
          phase_id: lastPhaseId,
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
  const displayedTaskIds = useMemo(
    () =>
      rows
        .filter((r): r is Extract<RowEntry, { kind: 'task' }> => r.kind === 'task')
        .map((r) => r.task.id),
    [rows]
  )

  const handleRowSelect = useCallback((taskId: string, e: React.MouseEvent) => {
    const isMod = e.ctrlKey || e.metaKey

    // Clicking any task row clears phase cell selection and the empty-row highlight
    setSelectedPhaseCell(null)
    setSelectedPhaseId(null)
    setSelectedEmptyRow(null)

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
        // Focus the grid so keyboard shortcuts (e.g. Cmd+Delete) work immediately
        gridRef.current?.focus()
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
      // Focus the grid so keyboard shortcuts (e.g. Cmd+Delete) work immediately
      gridRef.current?.focus()
      return
    }

    // Plain click: single selection
    setSelectedRowId(taskId)
    setSelectedRowIds(new Set([taskId]))
    // Focus the grid so keyboard shortcuts (e.g. Cmd+Delete) work immediately
    // after a plain row click, without requiring the user to click a cell first.
    gridRef.current?.focus()
  }, [selectedRowId, displayedTaskIds])

  // ─── WBS number click: select entire row(s) ─────────────────────────────────

  // Click on a task's WBS number cell → select the full row (anchor=first col, head=last col).
  // Shift+click extends the row range. Cmd+click extends range to include the clicked row.
  // Note: onMouseDown on the WBS cell sets suppressNextWbsClickRef to prevent this from
  // running after a drag (where the drag selection should be preserved).
  const handleTaskWbsClick = useCallback((taskId: string, e: React.MouseEvent) => {
    if (suppressNextWbsClickRef.current) {
      suppressNextWbsClickRef.current = false
      return
    }
    const editableCols_ = columns.filter((c) => !NON_EDITABLE_COLS.has(c))
    if (editableCols_.length === 0) return

    const firstCol = editableCols_[0]
    const lastCol = editableCols_[editableCols_.length - 1]
    const isMod = e.ctrlKey || e.metaKey

    setSelectedPhaseCell(null)
    setSelectedPhaseId(null)
    setSelectedEmptyRow(null)
    setActiveCell(null)

    if (e.shiftKey && selectedRowId) {
      // Extend row range selection (keep anchor row, update head row)
      const anchorIdx = displayedTaskIds.indexOf(selectedRowId)
      const currentIdx = displayedTaskIds.indexOf(taskId)
      if (anchorIdx !== -1 && currentIdx !== -1) {
        const lo = Math.min(anchorIdx, currentIdx)
        const hi = Math.max(anchorIdx, currentIdx)
        const rangeIds = displayedTaskIds.slice(lo, hi + 1)
        setSelectedRowIds(new Set(rangeIds))
        // Also set cell-level selection range so Cmd+C/X works on the full rows
        setSelectionAnchor({ taskId: displayedTaskIds[lo], col: firstCol })
        setSelectionHead({ taskId: displayedTaskIds[hi], col: lastCol })
        setSelectedCell(null)
        gridRef.current?.focus()
        return
      }
    }

    if (isMod) {
      // Toggle individual row in selectedRowIds (flyover multi-select)
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
      setSelectionAnchor(null)
      setSelectionHead(null)
      setSelectedCell(null)
      gridRef.current?.focus()
      return
    }

    // Plain click: select this single row in full (cell range = all editable cols)
    setSelectedRowId(taskId)
    setSelectedRowIds(new Set([taskId]))
    setSelectionAnchor({ taskId, col: firstCol })
    setSelectionHead({ taskId, col: lastCol })
    setSelectedCell(null)
    gridRef.current?.focus()
  }, [columns, selectedRowId, displayedTaskIds])

  // Click on a phase's WBS number cell → select all tasks in that phase.
  const handlePhaseWbsClick = useCallback((phaseId: string, e: React.MouseEvent) => {
    const editableCols_ = columns.filter((c) => !NON_EDITABLE_COLS.has(c))
    if (editableCols_.length === 0) return

    const firstCol = editableCols_[0]
    const lastCol = editableCols_[editableCols_.length - 1]

    setSelectedEmptyRow(null)
    setActiveCell(null)

    // Collect task IDs belonging to this phase in display order
    const phaseTaskIds = displayedTaskIds.filter((id) => {
      const task = tasks.find((t) => t.id === id)
      return task?.phase_id === phaseId
    })
    if (phaseTaskIds.length === 0) return

    const firstTaskId = phaseTaskIds[0]
    const lastTaskId = phaseTaskIds[phaseTaskIds.length - 1]

    setSelectedRowId(firstTaskId)
    setSelectedRowIds(new Set(phaseTaskIds))
    setSelectionAnchor({ taskId: firstTaskId, col: firstCol })
    setSelectionHead({ taskId: lastTaskId, col: lastCol })
    setSelectedCell(null)
    gridRef.current?.focus()
  }, [columns, displayedTaskIds, tasks])

  // ─── Phase row handlers ──────────────────────────────────────────────────────

  const handlePhaseRowSelect = useCallback((phaseId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedPhaseId(phaseId)
    setSelectedPhaseCell(null)
    setSelectedRowId(null)
    setSelectedRowIds(new Set())
    setSelectionAnchor(null)
    setSelectionHead(null)
    setSelectedCell(null)
    setSelectedEmptyRow(null)
    gridRef.current?.focus()
  }, [])

  const handlePhaseCellClick = useCallback((phaseId: string, col: GanttColKey, e: React.MouseEvent) => {
    e.stopPropagation()
    // タスク側の選択をクリア
    setSelectedRowId(null)
    setSelectedRowIds(new Set())
    setSelectionAnchor(null)
    setSelectionHead(null)
    setSelectedCell(null)
    setSelectedEmptyRow(null)
    // フェーズ行・セルを選択
    setSelectedPhaseId(phaseId)
    setSelectedPhaseCell({ phaseId, col })
    gridRef.current?.focus()
  }, [])

  const handlePhaseCellMouseDown = useCallback((phaseId: string, col: GanttColKey, e: React.MouseEvent) => {
    // 左ボタンのみ、テキスト選択を防ぐ
    if (e.button !== 0) return
    // name 列はダブルクリック編集があるので preventDefault しない
    // ただし drag でのテキスト選択は防ぐ
    e.preventDefault()
    handlePhaseCellClick(phaseId, col, e)
  }, [handlePhaseCellClick])

  const handlePhaseNameDoubleClick = useCallback((phase: Phase) => {
    setActivePhaseName({ phaseId: phase.id })
    setPhaseEditValue(phase.name)
  }, [])

  const commitPhaseName = useCallback(async () => {
    if (!activePhaseName) return
    const { phaseId } = activePhaseName
    const newName = phaseEditValue.trim()
    setActivePhaseName(null)
    if (!newName) return
    const phase = phases.find((p) => p.id === phaseId)
    if (!phase || newName === phase.name) return
    upsertPhase({ ...phase, name: newName })  // optimistic
    const res = await fetch('/api/phases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: phaseId, name: newName }),
    })
    if (!res.ok) upsertPhase(phase)  // revert
  }, [activePhaseName, phaseEditValue, phases, upsertPhase])

  const handlePhaseContextMenu = useCallback((e: React.MouseEvent, phaseId: string) => {
    e.preventDefault()
    setSelectedPhaseId(phaseId)
    setPhaseContextMenu({ x: e.clientX, y: e.clientY, phaseId })
  }, [])

  const deletePhaseById = useCallback(async (phaseId: string) => {
    if (phaseId === '__unassigned__') {
      // 未分類セクションの削除: phase_id が null のタスクをすべて削除
      const unassigned = tasks.filter((t) => t.phase_id === null)
      for (const t of unassigned) removeTask(t.id)
      await Promise.all(unassigned.map((t) =>
        fetch(`/api/tasks?id=${t.id}`, { method: 'DELETE' })
      ))
      return
    }
    const phase = phases.find((p) => p.id === phaseId)
    if (!phase) return
    removePhase(phaseId)  // optimistic
    const res = await fetch(`/api/phases?id=${phaseId}`, { method: 'DELETE' })
    if (!res.ok) upsertPhase(phase)  // revert
  }, [phases, tasks, removeTask, removePhase, upsertPhase])

  const closePhaseContextMenu = useCallback(() => setPhaseContextMenu(null), [])

  const convertPhaseToTask = useCallback(async (phaseId: string) => {
    const phase = phases.find((p) => p.id === phaseId)
    if (!phase || !currentProject) return

    // フェーズ内タスク（prop の tasks を使用）
    const phaseTasks = tasks.filter((t) => t.phase_id === phaseId)

    // 子タスクの移動先: 削除後に残る最後のフェーズ（なければ未分類）
    const remainingPhases = phases.filter((p) => p.id !== phaseId)
    const targetPhase = remainingPhases.length > 0
      ? [...remainingPhases].sort((a, b) => b.display_order - a.display_order)[0]
      : null
    const targetPhaseId = targetPhase?.id ?? null

    // 楽観的更新: フェーズ内タスクを targetPhase に移動、フェーズを削除
    removePhase(phaseId)
    for (const t of phaseTasks) upsertTask({ ...t, phase_id: targetPhaseId })

    // PATCH: tasks の phase_id を targetPhaseId に変更
    const patchResults = await Promise.all(phaseTasks.map((t) =>
      fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, version: t.version, phase_id: targetPhaseId }),
      })
    ))

    if (patchResults.some((r) => !r.ok)) {
      upsertPhase(phase)
      for (const t of phaseTasks) upsertTask(t)
      return
    }

    // DELETE: フェーズ削除
    const deleteRes = await fetch(`/api/phases?id=${phaseId}`, { method: 'DELETE' })
    if (!deleteRes.ok) {
      upsertPhase(phase)
      for (const t of phaseTasks) upsertTask(t)
      return
    }

    // フェーズ名でタスクを新規作成（末尾に追加）
    const taskRes = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: currentProject.id,
        phase_id: targetPhaseId,
        name: phase.name,
        status: 'not_started',
        progress: 0,
        display_order: storeTasks.length,
      }),
    })
    if (taskRes.ok) {
      const { data: newTask } = await taskRes.json() as { data: Task }
      upsertTask(newTask)
    }
  }, [phases, tasks, currentProject, storeTasks.length, upsertTask, removePhase, upsertPhase])

  // ─── WBS drag-selection ──────────────────────────────────────────────────────

  const handleWbsMouseDown = useCallback((taskId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    // Suppress the onClick that fires after mousedown on the same element
    suppressNextWbsClickRef.current = true
    const editableCols_ = columns.filter((c) => !NON_EDITABLE_COLS.has(c))
    if (editableCols_.length === 0) return
    const firstCol = editableCols_[0]
    const lastCol = editableCols_[editableCols_.length - 1]
    const isMod = e.ctrlKey || e.metaKey

    setSelectedEmptyRow(null)
    setActiveCell(null)
    setSelectedCell(null)

    if (e.shiftKey) {
      // Shift+mousedown: extend selection from the current anchor row
      const currentAnchorId = selectionAnchorRef.current?.taskId ?? selectedRowIdRef.current
      if (currentAnchorId) {
        const anchorIdx = displayedTaskIds.indexOf(currentAnchorId)
        const currentIdx = displayedTaskIds.indexOf(taskId)
        if (anchorIdx !== -1 && currentIdx !== -1) {
          const lo = Math.min(anchorIdx, currentIdx)
          const hi = Math.max(anchorIdx, currentIdx)
          setSelectedRowIds(new Set(displayedTaskIds.slice(lo, hi + 1)))
          setSelectionHead({ taskId: displayedTaskIds[hi], col: lastCol })
          gridRef.current?.focus()
          return
        }
      }
    }

    if (isMod) {
      // Cmd+mousedown: extend range from existing anchor to this row
      const currentAnchorId = selectionAnchorRef.current?.taskId ?? selectedRowIdRef.current
      if (currentAnchorId) {
        const anchorIdx = displayedTaskIds.indexOf(currentAnchorId)
        const currentIdx = displayedTaskIds.indexOf(taskId)
        if (anchorIdx !== -1 && currentIdx !== -1) {
          const lo = Math.min(anchorIdx, currentIdx)
          const hi = Math.max(anchorIdx, currentIdx)
          setSelectedRowIds(new Set(displayedTaskIds.slice(lo, hi + 1)))
          setSelectionAnchor({ taskId: displayedTaskIds[lo], col: firstCol })
          setSelectionHead({ taskId: displayedTaskIds[hi], col: lastCol })
          gridRef.current?.focus()
          return
        }
      }
    }

    // Plain mousedown: start drag from this row
    isWbsDraggingRef.current = true
    setSelectedRowId(taskId)
    setSelectedRowIds(new Set([taskId]))
    setSelectionAnchor({ taskId, col: firstCol })
    setSelectionHead({ taskId, col: lastCol })
    gridRef.current?.focus()
  }, [columns, displayedTaskIds])

  const handleWbsMouseEnter = useCallback((taskId: string) => {
    if (!isWbsDraggingRef.current) return
    const editableCols_ = columns.filter((c) => !NON_EDITABLE_COLS.has(c))
    if (editableCols_.length === 0) return
    const lastCol = editableCols_[editableCols_.length - 1]
    setSelectionHead({ taskId, col: lastCol })

    // Extend row-level highlight as the drag passes through rows
    const idx = displayedTaskIds.indexOf(taskId)
    if (idx === -1) return
    const anchorId = selectionAnchorRef.current?.taskId
    const anchorIdx = anchorId ? displayedTaskIds.indexOf(anchorId) : -1
    if (anchorIdx === -1) return
    const lo = Math.min(anchorIdx, idx)
    const hi = Math.max(anchorIdx, idx)
    setSelectedRowIds(new Set(displayedTaskIds.slice(lo, hi + 1)))
  }, [columns, displayedTaskIds])

  // ─── Cell drag-selection ─────────────────────────────────────────────────────

  // Ordered list of editable columns as displayed
  const editableCols = useMemo(
    () => columns.filter((c) => !NON_EDITABLE_COLS.has(c)),
    [columns]
  )

  // Compute the set of cell keys covered by the current anchor↔head rectangle
  const selectionRange: Set<string> | null = useMemo(() => {
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
  }, [selectionAnchor, selectionHead, displayedTaskIds, editableCols])
  // Sync to ref so deleteRow always reads the latest range without stale closures
  selectionRangeRef.current = selectionRange

  const handleCellMouseDown = useCallback((task: TaskWithBaseline, col: GanttColKey, e: React.MouseEvent) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return

    // Clicking a task cell clears phase cell selection
    setSelectedPhaseCell(null)
    setSelectedPhaseId(null)

    // Shift+Click: expand the selection range without moving selectedCell
    if (e.shiftKey) {
      e.preventDefault()
      const anchor = selectionAnchorRef.current ?? (selectedCell ? { taskId: selectedCell.taskId, col: selectedCell.col } : null)
      if (!anchor) return
      setSelectionAnchor(anchor)
      setSelectionHead({ taskId: task.id, col })
      gridRef.current?.focus()
      return
    }

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
    setSelectedEmptyRow(null)
    setSelectedRowId(null)
    setSelectedRowIds(new Set())
  }, [commitEditWithValues, selectedCell])

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
  // Keep delete-related state in refs so the document keydown handler always
  // reads the latest values without going stale between renders
  selectedRowIdsRef.current = selectedRowIds
  selectedRowIdRef.current = selectedRowId
  // selectionRangeRef is updated after selectionRange is computed (see below)

  // End cell drag (and WBS drag) on mouseup anywhere in the document
  useEffect(() => {
    const onMouseUp = () => {
      // Reset WBS drag flag regardless of cell drag state
      isWbsDraggingRef.current = false

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

  // ─── Row-level clipboard paste (Ctrl+C/X rows then right-click → insert above/below) ────

  const pasteRows = useCallback(async (targetTaskId: string, position: 'above' | 'below') => {
    if (!rowClipboard || !currentProject) return
    const { rows: srcRows, mode } = rowClipboard

    // Only task rows can be pasted; skip phase rows
    const taskRows = srcRows.filter((r) => r.id !== undefined) as TaskWithBaseline[]
    if (taskRows.length === 0) return

    const targetTask = tasks.find((t) => t.id === targetTaskId)
    if (!targetTask) return
    const targetPhaseId = targetTask.phase_id

    // Determine insertion index
    const targetIdx = tasks.findIndex((t) => t.id === targetTaskId)
    const insertAt = position === 'above'
      ? (targetIdx >= 0 ? targetIdx : 0)
      : (targetIdx >= 0 ? targetIdx + 1 : tasks.length)

    if (mode === 'copy') {
      // POST new tasks for each row (in order)
      const createdIds: string[] = []
      for (const srcTask of taskRows) {
        try {
          const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project_id: currentProject.id,
              phase_id: targetPhaseId,
              name: `${srcTask.name} のコピー`,
              status: srcTask.status,
              start_date: srcTask.start_date,
              end_date: srcTask.end_date,
              progress: srcTask.progress,
              display_order: tasks.length + createdIds.length,
              dependencies: [],
            }),
          })
          if (res.ok) {
            const json = await res.json() as { data: Task }
            upsertTask(json.data)
            createdIds.push(json.data.id)
          } else {
            const json = await res.json() as { error?: string }
            console.error('Failed to copy task:', json.error)
          }
        } catch (err) {
          console.error('Failed to copy task:', err)
        }
      }

      if (createdIds.length === 0) return

      // Splice all new tasks at insertAt position
      const orderedIds = tasks.map((t) => t.id)
      orderedIds.splice(insertAt, 0, ...createdIds)
      const items = orderedIds.map((id, index) => ({ id, display_order: index }))

      try {
        await fetch('/api/tasks/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: currentProject.id, items }),
        })
      } catch (err) {
        console.error('Failed to reorder after paste:', err)
      }

      reorderTasks(orderedIds)
      // Clear row clipboard after copy-paste (matches Excel behaviour)
      setRowClipboard(null)

    } else {
      // Cut mode: move tasks by updating phase_id and display_order
      const srcIds = taskRows.map((t) => t.id)

      // Optimistic update: remove src rows from current position, insert at target
      const baseIds = tasks.map((t) => t.id).filter((id) => !srcIds.includes(id))
      const targetIdxInBase = baseIds.findIndex((id) => id === targetTaskId)
      const splicePos = position === 'above'
        ? (targetIdxInBase >= 0 ? targetIdxInBase : 0)
        : (targetIdxInBase >= 0 ? targetIdxInBase + 1 : baseIds.length)
      baseIds.splice(splicePos, 0, ...srcIds)
      const items = baseIds.map((id, index) => ({ id, display_order: index }))

      // Optimistic: update phase_id of moved tasks
      for (const srcTask of taskRows) {
        upsertTask({ ...srcTask, phase_id: targetPhaseId } as Task)
      }
      reorderTasks(baseIds)

      // PATCH phase_id for each moved task
      const patchResults = await Promise.all(taskRows.map((srcTask) =>
        fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: srcTask.id, version: srcTask.version, phase_id: targetPhaseId }),
        })
      ))

      // Persist new order
      try {
        await fetch('/api/tasks/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: currentProject.id, items }),
        })
      } catch (err) {
        console.error('Failed to reorder after cut-paste:', err)
      }

      // Revert on patch failure
      if (patchResults.some((r) => !r.ok)) {
        for (const srcTask of taskRows) {
          upsertTask(srcTask as Task)
        }
        reorderTasks(tasks.map((t) => t.id))
        return
      }

      // Update local store with server-returned tasks
      for (let i = 0; i < patchResults.length; i++) {
        const r = patchResults[i]
        if (r.ok) {
          const json = await r.json() as { data: Task }
          upsertTask(json.data)
        }
      }

      // Clear row clipboard after cut-paste
      setRowClipboard(null)
      setSelectedRowIds(new Set(srcIds))
      setSelectedRowId(srcIds[0] ?? null)
    }
  }, [rowClipboard, currentProject, tasks, upsertTask, reorderTasks])

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
    // Read latest values from refs to avoid stale closures when called from the
    // document keydown handler, which captures deleteRow at registration time.
    const currentSelectionRange = selectionRangeRef.current
    const currentSelectedRowIds = selectedRowIdsRef.current
    const currentSelectedRowId = selectedRowIdRef.current

    // Derive the set of rows to delete:
    // 1. If a cell-drag range is active, collect the unique row IDs from that range.
    // 2. Otherwise fall back to the row-click selection set (selectedRowIds > 1).
    // 3. Default to the single taskId passed by the caller.
    let idsToDelete: string[]
    if (currentSelectionRange && currentSelectionRange.size > 0) {
      const rangeRowIds = new Set<string>()
      for (const key of currentSelectionRange) {
        const colonIdx = key.indexOf(':')
        if (colonIdx !== -1) rangeRowIds.add(key.slice(0, colonIdx))
      }
      idsToDelete = [...rangeRowIds]
    } else if (currentSelectedRowIds.size > 1) {
      idsToDelete = [...currentSelectedRowIds]
    } else {
      idsToDelete = [taskId]
    }

    await Promise.all(idsToDelete.map((id) => deleteSingleRow(id)))

    if (idsToDelete.includes(currentSelectedRowId ?? '')) {
      setSelectedRowId(null)
    }
    setSelectedRowIds((prev) => {
      const next = new Set(prev)
      for (const id of idsToDelete) next.delete(id)
      return next
    })
    setSelectionAnchor(null)
    setSelectionHead(null)
  }, [deleteSingleRow])

  const insertRow = useCallback(async (relativeToTaskId: string, position: 'above' | 'below') => {
    if (!currentProject) return

    const relIdx = tasks.findIndex((t) => t.id === relativeToTaskId)
    // Temporarily place the new task at the end; display_order will be fixed by reorder below
    const tempDisplayOrder = tasks.length

    const relativeTask = tasks.find((t) => t.id === relativeToTaskId)
    const samePhaseId = relativeTask?.phase_id ?? null

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: currentProject.id,
          phase_id: samePhaseId,
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

  // Resolve the rectangular selection as ordered (rowIds × cols).
  // Reads anchor/head/range from refs so the closure never goes stale between renders
  // (e.g. immediately after a mouse-drag selection that hasn't re-rendered yet).
  const resolveSelectionRect = useCallback((): { rowIds: string[]; cols: GanttColKey[] } | null => {
    const currentRange = selectionRangeRef.current
    const currentAnchor = selectionAnchorRef.current
    const currentHead = selectionHeadRef.current
    if (currentRange && currentAnchor && currentHead) {
      const taskIds = displayedTaskIds
      const anchorRowIdx = taskIds.indexOf(currentAnchor.taskId)
      const headRowIdx = taskIds.indexOf(currentHead.taskId)
      const anchorColIdx = editableCols.indexOf(currentAnchor.col)
      const headColIdx = editableCols.indexOf(currentHead.col)
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
  }, [selectedCell, displayedTaskIds, editableCols])

  const copyCellsToClipboard = useCallback(async (rect: { rowIds: string[]; cols: GanttColKey[] }) => {
    // Read from tasksRef so that the latest task state (e.g. after a name edit) is always used,
    // even when this callback was created before the most recent render.
    const latestTasks = tasksRef.current
    const lines = rect.rowIds.map((rowId) => {
      const task = latestTasks.find((t) => t.id === rowId)
      if (!task) return rect.cols.map(() => '').join('\t')
      return rect.cols.map((col) => getRawValue(task, col)).join('\t')
    })
    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      hasCellClipboardRef.current = true
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
      hasCellClipboardRef.current = true
    }
  }, [])

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
    // Record each cleared cell in the undo stack using the same rules as handleCellDelete
    const patches: { task: TaskWithBaseline; payload: Record<string, string | number | null> }[] = []
    for (const rowId of rect.rowIds) {
      const task = tasks.find((t) => t.id === rowId)
      if (!task || !canEditTask(task)) continue
      const payload: Record<string, string | number | null> = {}
      for (const col of rect.cols) {
        if (col === 'name') continue // name is not cleared on cut
        const defaultVal = getDefaultRawValue(col)
        if (col === 'progress') {
          pushCommand({ taskId: task.id, field: 'progress', before: task.progress, after: 0 })
          payload[col] = parseInt(defaultVal, 10)
        } else if (col === 'start_date') {
          pushCommand({ taskId: task.id, field: 'start_date', before: task.start_date, after: null })
          payload[col] = null
        } else if (col === 'end_date') {
          pushCommand({ taskId: task.id, field: 'end_date', before: task.end_date, after: null })
          payload[col] = null
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
  }, [resolveSelectionRect, copyCellsToClipboard, tasks, canEditTask, permissions, upsertTask, pushCommand])

  const handleCellPaste = useCallback(async () => {
    if (!permissions?.canEdit) return
    // Origin cell: top-left of selection range, or selectedCell.
    // Read anchor/head from refs so we always see the latest selection
    // even if this callback was captured before the most recent state update.
    let originTaskId: string | null = null
    let originCol: GanttColKey | null = null

    const currentRange = selectionRangeRef.current
    const currentAnchor = selectionAnchorRef.current
    const currentHead = selectionHeadRef.current
    if (currentRange && currentAnchor && currentHead) {
      const taskIds = displayedTaskIds
      const anchorRowIdx = taskIds.indexOf(currentAnchor.taskId)
      const headRowIdx = taskIds.indexOf(currentHead.taskId)
      const anchorColIdx = editableCols.indexOf(currentAnchor.col)
      const headColIdx = editableCols.indexOf(currentHead.col)
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

    const patches: { task: TaskWithBaseline; beforeValues: Record<string, string | number | null>; payload: Record<string, string | number | null> }[] = []

    for (let r = 0; r < pasteRows.length; r++) {
      const targetRowIdx = originRowIdx + r
      if (targetRowIdx >= displayedTaskIds.length) break
      const targetTaskId = displayedTaskIds[targetRowIdx]
      const task = tasks.find((t) => t.id === targetTaskId)
      if (!task || !canEditTask(task)) continue

      const payload: Record<string, string | number | null> = {}
      const beforeValues: Record<string, string | number | null> = {}
      for (let c = 0; c < pasteRows[r].length; c++) {
        const targetColIdx = originColIdx + c
        if (targetColIdx >= editableCols.length) break
        const col = editableCols[targetColIdx]
        if (NON_EDITABLE_COLS.has(col)) continue
        const rawVal = pasteRows[r][c] ?? ''
        if (col === 'name') {
          // Skip empty values for name (RBAC guard + required field)
          if (!rawVal.trim()) continue
          beforeValues[col] = task.name
          payload[col] = rawVal.trim()
        } else if (col === 'progress') {
          const n = parseInt(rawVal, 10)
          const clamped = isNaN(n) ? 0 : Math.min(100, Math.max(0, n))
          beforeValues[col] = task.progress
          payload[col] = clamped
        } else if (col === 'start_date' || col === 'end_date') {
          beforeValues[col] = task[col]
          payload[col] = rawVal || null
        } else {
          beforeValues[col] = getRawValue(task, col)
          payload[col] = rawVal
        }
      }
      if (Object.keys(payload).length > 0) patches.push({ task, beforeValues, payload })
    }

    for (const { task, beforeValues, payload } of patches) {
      // Record each changed cell in the undo stack
      for (const col of Object.keys(payload) as GanttColKey[]) {
        if (col in beforeValues) {
          pushCommand({ taskId: task.id, field: col, before: beforeValues[col], after: payload[col] })
        }
      }
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
    selectedCell,
    displayedTaskIds,
    editableCols,
    tasks,
    canEditTask,
    upsertTask,
    pushCommand,
  ])

  // Clear the selected cell range (Delete/Backspace key, no modifier)
  // name column is skipped; other columns reset to their default empty value.
  const handleCellDelete = useCallback(async () => {
    if (!permissions?.canEdit) return
    const rect = resolveSelectionRect()
    if (!rect) return

    type ClearPayload = {
      id: string
      version: number
      status?: 'not_started'
      start_date?: null
      end_date?: null
      progress?: number
    }

    const patches: { task: TaskWithBaseline; payload: ClearPayload }[] = []
    for (const rowId of rect.rowIds) {
      const task = tasks.find((t) => t.id === rowId)
      if (!task || !canEditTask(task)) continue
      const payload: ClearPayload = { id: task.id, version: task.version }
      for (const col of rect.cols) {
        if (col === 'name') continue
        if (col === 'start_date') {
          // Record one undo command per cell cleared
          pushCommand({ taskId: task.id, field: 'start_date', before: task.start_date, after: null })
          payload.start_date = null
        } else if (col === 'end_date') {
          pushCommand({ taskId: task.id, field: 'end_date', before: task.end_date, after: null })
          payload.end_date = null
        } else if (col === 'progress') {
          pushCommand({ taskId: task.id, field: 'progress', before: task.progress, after: 0 })
          payload.progress = 0
        }
        // vendor / updated_at are not editable; GanttLeftPanel has no status col
      }
      // Only patch if there's something beyond id+version
      if (Object.keys(payload).length > 2) patches.push({ task, payload })
    }

    for (const { task, payload } of patches) {
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
        }
      } catch {
        upsertTask(task as Task)
      }
    }
  }, [permissions, resolveSelectionRect, tasks, canEditTask, upsertTask, pushCommand])

  // Paste TSV text into empty rows starting at emptyRowIndex.
  // Used by both the keyboard shortcut (Cmd+V on empty row) and the empty-row context menu.
  const doPasteIntoEmpty = useCallback(async (text: string, rowIndex: number) => {
    if (!currentProject) return
    const lines = text.split('\n')
    const available = emptyRowCountRef.current - rowIndex
    const limit = Math.min(lines.length, available)
    const lastPhase = phases.length > 0
      ? [...phases].sort((a, b) => a.display_order - b.display_order).at(-1)
      : null
    for (let i = 0; i < limit; i++) {
      const cols = lines[i].split('\t')
      const name = cols[0]?.trim() ?? ''
      if (!name) continue
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: currentProject.id,
            phase_id: lastPhase?.id ?? null,
            name,
            status: 'not_started',
            progress: 0,
            display_order: storeTasks.length + i,
          }),
        })
        if (res.ok) {
          const json = await res.json() as { data: Task }
          upsertTask(json.data)
        }
      } catch {
        // ignore individual row failures
      }
    }
    setSelectedEmptyRow(null)
  }, [currentProject, phases, storeTasks.length, upsertTask])

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing inside an input / textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return

      // When the grid div has focus, handleGridKeyDown already handles Cmd+Delete.
      // Firing here too would trigger a second deleteRow call on the same keystroke.
      if (gridRef.current && gridRef.current.contains(e.target as Node)) return

      const isMod = e.ctrlKey || e.metaKey
      // Read the latest selectedRowId from ref to avoid stale closure
      const currentSelectedRowId = selectedRowIdRef.current
      if (!currentSelectedRowId || !permissions?.canEdit) return

      // Cmd+Delete (or Cmd+Backspace): delete selected task row(s) without confirmation
      if (isMod && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        void deleteRow(currentSelectedRowId)
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // selectedRowIdRef is a ref — reading it inside handler is always fresh.
    // permissions and deleteRow are the only true dependencies here.
  }, [permissions, deleteRow])

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
  const closeEmptyRowContextMenu = useCallback(() => setEmptyRowContextMenu(null), [])

  // Close context menus when clicking anywhere outside
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => closeContextMenu()
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [contextMenu, closeContextMenu])

  useEffect(() => {
    if (!emptyRowContextMenu) return
    const handler = () => closeEmptyRowContextMenu()
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [emptyRowContextMenu, closeEmptyRowContextMenu])

  useEffect(() => {
    if (!phaseContextMenu) return
    const handler = () => closePhaseContextMenu()
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [phaseContextMenu, closePhaseContextMenu])

  // Reset committingRef whenever activeCell becomes null externally
  useEffect(() => {
    if (!activeCell) committingRef.current = false
  }, [activeCell])

  // ─── グリッドコンテナのキーボード操作（選択中セルへの操作）────────────────────

  const handleGridKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // 入力中（編集モード）は input 内の onKeyDown が担当するのでここでは処理しない
    if (activeCell || editingEmptyRowIndex !== null) return

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

    // ─── 行レベルコピー / 切り取り (selectedRowIds が活性 & セル選択なし) ──────
    if (isMod && !selectedCell && !selectionRange && selectedRowIds.size > 0) {
      if (e.key === 'c') {
        e.preventDefault()
        const rowsToClip = tasks.filter((t) => selectedRowIds.has(t.id))
        if (rowsToClip.length > 0) {
          setRowClipboard({ rows: rowsToClip as TaskWithBaseline[], mode: 'copy' })
        }
        return
      }
      if (e.key === 'x') {
        e.preventDefault()
        if (!permissions?.canEdit) return
        const rowsToClip = tasks.filter((t) => selectedRowIds.has(t.id))
        if (rowsToClip.length > 0) {
          setRowClipboard({ rows: rowsToClip as TaskWithBaseline[], mode: 'cut' })
        }
        return
      }
    }

    // ─── Escape: 行クリップボードをクリア（セル選択クリアは後続ロジックで行う）──
    if (e.key === 'Escape') {
      setRowClipboard(null)
      // Fall through so the normal Escape path (clear selectedCell) also runs
    }

    const editableCols_ = columns.filter((c) => !NON_EDITABLE_COLS.has(c))

    // ─── 空白行が選択中のキーボード操作 ─────────────────────────────────────
    if (!selectedCell && selectedEmptyRow) {
      const { rowIndex, col } = selectedEmptyRow
      const colIdx = editableCols_.indexOf(col)

      if (isMod && e.key === 'v') {
        e.preventDefault()
        navigator.clipboard.readText().then((t) => void doPasteIntoEmpty(t, rowIndex)).catch(() => {
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

    // Ctrl+Home / Ctrl+End when no task cell is selected (e.g. empty row selected or nothing)
    if (!selectedCell) {
      // Cmd+Delete: delete selected rows even when no individual cell is focused.
      // deleteRow reads selectionRangeRef / selectedRowIdsRef internally, so passing
      // any row ID from the current selection is sufficient to trigger the right path.
      if (isMod && (e.key === 'Delete' || e.key === 'Backspace') && permissions?.canEdit) {
        const anchor = selectionAnchorRef.current
        const fallbackId = anchor?.taskId ?? selectedRowIdRef.current
        if (fallbackId) {
          e.preventDefault()
          void deleteRow(fallbackId)
        }
        return
      }

      if (isMod && e.key === 'Home' && tasks.length > 0 && editableCols_.length > 0) {
        e.preventDefault()
        const firstTask = tasks[0]
        setSelectedCell({ taskId: firstTask.id, col: editableCols_[0] })
        setSelectedRowId(firstTask.id)
        setSelectedRowIds(new Set([firstTask.id]))
        setSelectedEmptyRow(null)
        setSelectionAnchor(null)
        setSelectionHead(null)
        return
      }
      if (isMod && e.key === 'End' && tasks.length > 0 && editableCols_.length > 0) {
        e.preventDefault()
        const lastTask = tasks[tasks.length - 1]
        setSelectedCell({ taskId: lastTask.id, col: editableCols_[editableCols_.length - 1] })
        setSelectedRowId(lastTask.id)
        setSelectedRowIds(new Set([lastTask.id]))
        setSelectedEmptyRow(null)
        setSelectionAnchor(null)
        setSelectionHead(null)
        return
      }
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

    // printable文字キー（修飾キーなし）→ 編集開始
    // IME入力中（e.isComposing または e.key === 'Process'）の場合はセル内容をクリアせず
    // フォーカスのみ当てて IME が正常に動作するようにする
    if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      if (e.nativeEvent.isComposing || e.key === 'Process') {
        // IME composition: open edit preserving existing content so IME can compose normally
        openCell(task as TaskWithBaseline, selectedCell.col)
      } else {
        e.preventDefault()
        openCell(task as TaskWithBaseline, selectedCell.col, e.key)
      }
      return
    }

    // Ctrl+Home: jump to first task row, first editable column
    if (isMod && e.key === 'Home') {
      e.preventDefault()
      if (tasks.length > 0 && editableCols_.length > 0) {
        const firstTask = tasks[0]
        setSelectedCell({ taskId: firstTask.id, col: editableCols_[0] })
        setSelectedRowId(firstTask.id)
        setSelectedRowIds(new Set([firstTask.id]))
        setSelectionAnchor(null)
        setSelectionHead(null)
      }
      return
    }

    // Ctrl+End: jump to last task row, last editable column
    if (isMod && e.key === 'End') {
      e.preventDefault()
      if (tasks.length > 0 && editableCols_.length > 0) {
        const lastTask = tasks[tasks.length - 1]
        setSelectedCell({ taskId: lastTask.id, col: editableCols_[editableCols_.length - 1] })
        setSelectedRowId(lastTask.id)
        setSelectedRowIds(new Set([lastTask.id]))
        setSelectionAnchor(null)
        setSelectionHead(null)
      }
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
        // Excelと同様：1行下のセルに移動（編集モードには入らない）
        e.preventDefault()
        setSelectionAnchor(null)
        setSelectionHead(null)
        if (taskIdx < tasks.length - 1) {
          const nextTask = tasks[taskIdx + 1]
          setSelectedCell({ taskId: nextTask.id, col: selectedCell.col })
          setSelectedRowId(nextTask.id)
          setSelectedRowIds(new Set([nextTask.id]))
        } else if (emptyRowCountRef.current > 0) {
          // 最終タスク行 → 最初の空白行へ
          setSelectedCell(null)
          setSelectedRowId(null)
          setSelectedRowIds(new Set())
          setSelectedEmptyRow({ rowIndex: 0, col: NON_EDITABLE_COLS.has(selectedCell.col) ? editableCols_[0] : selectedCell.col })
        }
        return
      }
      case 'ArrowUp': {
        e.preventDefault()
        if (e.shiftKey) {
          // Shift+Arrow: expand range selection without moving selectedCell
          const anchor = selectionAnchor ?? selectedCell
          const currentHead = selectionHead ?? selectedCell
          const headTaskIdx = tasks.findIndex((t) => t.id === currentHead.taskId)
          const newHeadTaskIdx = Math.max(0, headTaskIdx - 1)
          setSelectionAnchor(anchor)
          setSelectionHead({ taskId: tasks[newHeadTaskIdx].id, col: currentHead.col })
          return
        }
        setSelectionAnchor(null)
        setSelectionHead(null)
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
        if (e.shiftKey) {
          const anchor = selectionAnchor ?? selectedCell
          const currentHead = selectionHead ?? selectedCell
          const headTaskIdx = tasks.findIndex((t) => t.id === currentHead.taskId)
          const newHeadTaskIdx = Math.min(tasks.length - 1, headTaskIdx + 1)
          setSelectionAnchor(anchor)
          setSelectionHead({ taskId: tasks[newHeadTaskIdx].id, col: currentHead.col })
          return
        }
        setSelectionAnchor(null)
        setSelectionHead(null)
        if (taskIdx < tasks.length - 1) {
          const nextTask = tasks[taskIdx + 1]
          setSelectedCell({ taskId: nextTask.id, col: selectedCell.col })
          setSelectedRowId(nextTask.id)
          setSelectedRowIds(new Set([nextTask.id]))
        } else if (emptyRowCountRef.current > 0) {
          // Move from the last task row into the first empty row; clear task selection highlight
          setSelectedCell(null)
          setSelectedRowId(null)
          setSelectedRowIds(new Set())
          setSelectedEmptyRow({ rowIndex: 0, col: NON_EDITABLE_COLS.has(selectedCell.col) ? editableCols_[0] : selectedCell.col })
        }
        return
      }
      case 'ArrowLeft': {
        e.preventDefault()
        if (e.shiftKey) {
          const anchor = selectionAnchor ?? selectedCell
          const currentHead = selectionHead ?? selectedCell
          const headColIdx = editableCols_.indexOf(currentHead.col)
          const newHeadColIdx = Math.max(0, headColIdx - 1)
          setSelectionAnchor(anchor)
          setSelectionHead({ taskId: currentHead.taskId, col: editableCols_[newHeadColIdx] })
          return
        }
        setSelectionAnchor(null)
        setSelectionHead(null)
        if (colIdx > 0) {
          setSelectedCell({ taskId: selectedCell.taskId, col: editableCols_[colIdx - 1] })
        }
        return
      }
      case 'ArrowRight': {
        e.preventDefault()
        if (e.shiftKey) {
          const anchor = selectionAnchor ?? selectedCell
          const currentHead = selectionHead ?? selectedCell
          const headColIdx = editableCols_.indexOf(currentHead.col)
          const newHeadColIdx = Math.min(editableCols_.length - 1, headColIdx + 1)
          setSelectionAnchor(anchor)
          setSelectionHead({ taskId: currentHead.taskId, col: editableCols_[newHeadColIdx] })
          return
        }
        setSelectionAnchor(null)
        setSelectionHead(null)
        if (colIdx < editableCols_.length - 1) {
          setSelectedCell({ taskId: selectedCell.taskId, col: editableCols_[colIdx + 1] })
        }
        return
      }
      case 'PageUp':
      case 'PageDown': {
        e.preventDefault()
        const scrollEl = gridRef.current
        if (!scrollEl) return
        const delta = e.key === 'PageUp' ? -scrollEl.clientHeight : scrollEl.clientHeight
        scrollEl.scrollBy({ top: delta, behavior: 'smooth' })
        // Also scroll the outer panel container so the timeline stays in sync
        const outerEl = scrollEl.parentElement?.parentElement
        if (outerEl && outerEl.scrollHeight > outerEl.clientHeight) {
          outerEl.scrollBy({ top: delta, behavior: 'smooth' })
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
        // Clear row-level clipboard immediately (belt-and-suspenders; also cleared above at 2499)
        setRowClipboard(null)
        // Clear stale row selection so a subsequent Ctrl+C won't trigger row-level copy
        setSelectedRowId(null)
        setSelectedRowIds(new Set())
        setSelectionAnchor(null)
        setSelectionHead(null)
        return
      }
      case 'Delete':
      case 'Backspace': {
        // Cmd+Delete: delete selected task row(s) without confirmation
        if (isMod) {
          e.preventDefault()
          if (permissions?.canEdit) {
            // deleteRow respects selectedRowIds for multi-row deletion
            void deleteRow(selectedCell.taskId)
            setSelectedCell(null)
          }
          return
        }
        // Delete/Backspace alone: clear the selected cell(s)
        e.preventDefault()
        void handleCellDelete()
        return
      }
    }
  }, [
    activeCell,
    editingEmptyRowIndex,
    selectedCell,
    selectedEmptyRow,
    selectionRange,
    selectionAnchor,
    selectionHead,
    selectedRowId,
    selectedRowIds,
    tasks,
    columns,
    openCell,
    handleCellCopy,
    handleCellCut,
    handleCellPaste,
    handleCellDelete,
    submitEmptyRow,
    permissions,
    deleteRow,
    doPasteIntoEmpty,
    rowClipboard,
  ])

  return (
    <>
      <style>{`
        @keyframes blink {
          0%, 100% { outline-color: transparent; }
          50% { outline-color: currentColor; }
        }
        .marching-ants-copy {
          outline: 2px solid #6366f1;
          outline-offset: -2px;
          color: #6366f1;
          animation: blink 1s step-start infinite;
        }
        .marching-ants-cut {
          outline: 2px solid #f59e0b;
          outline-offset: -2px;
          color: #f59e0b;
          animation: blink 1s step-start infinite;
          opacity: 0.7;
        }
      `}</style>
      <div className="flex flex-col h-full overflow-hidden" style={{ width: totalWidth }}>
        {/* Header */}
        <div
          className="flex items-center border-b border-slate-200 bg-slate-50 flex-shrink-0 sticky top-0 z-10"
          style={{ height: 56 }}
        >
          {/* Row number header */}
          <div
            className="flex-shrink-0 flex items-center justify-center border-r border-slate-200 text-xs font-medium text-slate-400"
            style={{ width: 36, height: '100%' }}
          >
            #
          </div>
          {columns.map((col) => {
            const isEditable = !NON_EDITABLE_COLS.has(col)
            return (
              <div
                key={col}
                className={[
                  'flex-shrink-0 relative flex items-center border-r border-slate-200 text-xs font-medium text-slate-500 select-none overflow-hidden',
                  isEditable ? 'cursor-pointer hover:bg-indigo-100' : '',
                ].join(' ')}
                style={{ width: effectiveColWidths[col], height: '100%', paddingLeft: 8, paddingRight: 8 }}
                onClick={() => {
                  if (!isEditable || tasks.length === 0) return
                  // Select entire column: anchor = first task row, head = last task row
                  setSelectionAnchor({ taskId: tasks[0].id, col })
                  setSelectionHead({ taskId: tasks[tasks.length - 1].id, col })
                  setSelectedCell(null)
                  setSelectedRowId(null)
                  setSelectedRowIds(new Set())
                  gridRef.current?.focus()
                }}
              >
                <span className="truncate">{COL_LABELS[col]}</span>
                {/* Drag handle for column resize */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-300 z-10"
                  onMouseDown={(e) => handleColResizeMouseDown(col, e)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )
          })}
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
          {visibleRows.map((row) => {
            if (row.kind === 'phase') {
              const phaseId = row.phase.id
              const isEditingPhaseName = activePhaseName?.phaseId === phaseId
              return (
                <PhaseRow
                  key={`phase-${phaseId}`}
                  phase={row.phase}
                  rowHeight={rowHeight}
                  columns={columns}
                  colWidths={effectiveColWidths}
                  wbsNumber={row.wbsNumber}
                  aggStart={row.aggStart}
                  aggEnd={row.aggEnd}
                  aggProgress={row.aggProgress}
                  isSelected={selectedPhaseId === phaseId}
                  isEditing={isEditingPhaseName}
                  editValue={phaseEditValue}
                  onEditValueChange={setPhaseEditValue}
                  onCommitEdit={() => { void commitPhaseName() }}
                  onCancelEdit={() => setActivePhaseName(null)}
                  onNameDoubleClick={() => handlePhaseNameDoubleClick(row.phase)}
                  onRowSelect={(e) => handlePhaseRowSelect(phaseId, e)}
                  onContextMenu={(e) => handlePhaseContextMenu(e, phaseId)}
                  onWbsClick={phaseId !== '__unassigned__' ? (e) => handlePhaseWbsClick(phaseId, e) : undefined}
                  onWbsMouseDown={phaseId !== '__unassigned__' ? (e) => {
                    if (e.button !== 0) return
                    e.preventDefault()
                    handlePhaseWbsClick(phaseId, e)
                    isWbsDraggingRef.current = true
                  } : undefined}
                  isCollapsed={collapsedPhaseIds.has(phaseId)}
                  onToggleCollapse={() => togglePhaseCollapse(phaseId)}
                  selectedCol={selectedPhaseCell?.phaseId === phaseId ? selectedPhaseCell.col : null}
                  onCellClick={(col, e) => handlePhaseCellClick(phaseId, col, e)}
                  onCellMouseDown={(col, e) => handlePhaseCellMouseDown(phaseId, col, e)}
                />
              )
            }

            const { task, visualIndex, wbsNumber } = row
            return (
              <TaskRow
                key={task.id}
                task={task}
                rowHeight={rowHeight}
                columns={columns}
                colWidths={effectiveColWidths}
                rowIndex={visualIndex}
                wbsNumber={wbsNumber}
                activeCell={activeCell}
                selectedCell={selectedCell}
                editValue={editValue}
                isSelected={selectedRowIds.has(task.id)}
                selectionRange={selectionRange}
                wrapText={wrapText}
                isInRowClipboard={rowClipboard !== null && rowClipboard.rows.some((r) => r.id === task.id)}
                rowClipboardMode={rowClipboard?.mode ?? null}
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
                onWbsClick={handleTaskWbsClick}
                onWbsMouseDown={handleWbsMouseDown}
                onWbsMouseEnter={handleWbsMouseEnter}
              />
            )
          })}

          {permissions?.canEdit && (() => {
            const MIN_TOTAL_ROWS = 20
            const visibleTaskCount = visibleRows.filter((r) => r.kind === 'task').length
            const emptyRowCount = Math.max(MIN_TOTAL_ROWS - visibleTaskCount, 0) + extraEmptyRows
            // Keep ref in sync so handleGridKeyDown can read the latest count without stale closures
            emptyRowCountRef.current = emptyRowCount
            return Array.from({ length: emptyRowCount }).map((_, i) => (
              <EmptyRow
                key={`empty-${i}`}
                rowHeight={rowHeight}
                columns={columns}
                colWidths={effectiveColWidths}
                rowIndex={visibleTaskCount + i}
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
                  // Clear row-level selection so previous task highlights are removed
                  setSelectedRowId(null)
                  setSelectedRowIds(new Set())
                  gridRef.current?.focus()
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setEmptyRowContextMenu({ x: e.clientX, y: e.clientY, rowIndex: i })
                }}
              />
            ))
          })()}
        </div>

        <div className="flex items-center gap-4 px-2 py-1 flex-shrink-0">
          {permissions?.canEdit && (
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600 text-sm"
              onClick={() => setExtraEmptyRows((n) => n + 10)}
            >
              + 10行追加
            </button>
          )}
        </div>
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
          hasRowClipboard={rowClipboard !== null}
          rowClipboardMode={rowClipboard?.mode ?? null}
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
            // Also set row-level clipboard so paste-above/below options appear
            const rowsToClip = [...selectedRowIds].includes(contextMenu.taskId)
              ? tasks.filter((t) => selectedRowIds.has(t.id)) as TaskWithBaseline[]
              : tasks.filter((t) => t.id === contextMenu.taskId) as TaskWithBaseline[]
            if (rowsToClip.length > 0) setRowClipboard({ rows: rowsToClip, mode: 'copy' })
          }}
          onCut={() => {
            closeContextMenu()
            cutRow(contextMenu.taskId)
            // Also set row-level clipboard so paste-above/below options appear
            const rowsToClip = [...selectedRowIds].includes(contextMenu.taskId)
              ? tasks.filter((t) => selectedRowIds.has(t.id)) as TaskWithBaseline[]
              : tasks.filter((t) => t.id === contextMenu.taskId) as TaskWithBaseline[]
            if (rowsToClip.length > 0) setRowClipboard({ rows: rowsToClip, mode: 'cut' })
          }}
          onPaste={() => {
            closeContextMenu()
            void pasteRow(contextMenu.taskId)
          }}
          onPasteAbove={() => {
            closeContextMenu()
            void pasteRows(contextMenu.taskId, 'above')
          }}
          onPasteBelow={() => {
            closeContextMenu()
            void pasteRows(contextMenu.taskId, 'below')
          }}
          onDelete={() => {
            const taskId = contextMenu.taskId
            closeContextMenu()
            void deleteRow(taskId)
          }}
        />
      )}

      {phaseContextMenu != null && (
        <PhaseContextMenu
          x={phaseContextMenu.x}
          y={phaseContextMenu.y}
          canEdit={!!permissions?.canEdit}
          isUnassigned={phaseContextMenu.phaseId === '__unassigned__'}
          onRename={() => {
            closePhaseContextMenu()
            const phase = phases.find((p) => p.id === phaseContextMenu.phaseId)
            if (phase) handlePhaseNameDoubleClick(phase)
          }}
          onDelete={() => {
            closePhaseContextMenu()
            void deletePhaseById(phaseContextMenu.phaseId)
          }}
          onConvertToTask={() => {
            closePhaseContextMenu()
            void convertPhaseToTask(phaseContextMenu.phaseId)
          }}
        />
      )}

      {emptyRowContextMenu != null && (
        <div
          className="fixed z-50 bg-white border border-slate-200 rounded shadow-lg py-1 min-w-[180px]"
          style={{ left: emptyRowContextMenu.x, top: emptyRowContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const rowIndex = emptyRowContextMenu.rowIndex
              closeEmptyRowContextMenu()
              setEditingEmptyRowIndex(rowIndex)
              setEmptyRowValue('')
              setSelectedEmptyRow(null)
            }}
            className="w-full flex items-center px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-indigo-50 cursor-pointer"
          >
            タスクを追加
          </button>
          {(() => {
            const rowIndex = emptyRowContextMenu.rowIndex
            const canPaste = hasCellClipboardRef.current || clipboard !== null
            return (
              <button
                disabled={!canPaste}
                onClick={() => {
                  closeEmptyRowContextMenu()
                  navigator.clipboard.readText().then((t) => void doPasteIntoEmpty(t, rowIndex)).catch(() => {
                    // Cannot read OS clipboard; silently ignore
                  })
                }}
                className={[
                  'w-full flex items-center justify-between px-3 py-1.5 text-xs text-left',
                  canPaste
                    ? 'text-slate-700 hover:bg-indigo-50 cursor-pointer'
                    : 'text-slate-300 cursor-not-allowed',
                ].join(' ')}
              >
                <span>貼り付け</span>
                <span className="ml-4 text-slate-400">Ctrl+V</span>
              </button>
            )
          })()}
        </div>
      )}
    </>
  )
}

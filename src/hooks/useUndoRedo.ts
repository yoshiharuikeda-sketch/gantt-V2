'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { useTaskStore } from '@/store/taskStore'
import type { Task, TaskStatus } from '@/types'

export type UndoCommand = {
  taskId: string
  field: string
  before: string | number | null
  after: string | number | null
}

type ApplyPatchFn = (taskId: string, field: string, value: string | number | null) => Promise<void>

/**
 * Provides undo/redo stacks and Cmd+Z / Cmd+Shift+Z keyboard handling.
 *
 * Callers must:
 *   1. Call `pushCommand(cmd)` right after a successful commitCell / commitEdit.
 *   2. Pass `isEditing` = true while any cell input is active so Cmd+Z is
 *      delegated to the browser's native undo rather than our custom stack.
 */
export function useUndoRedo(isEditing: () => boolean) {
  const upsertTask = useTaskStore((s) => s.upsertTask)
  const undoStack = useRef<UndoCommand[]>([])
  const redoStack = useRef<UndoCommand[]>([])
  // Reactive counters so callers can derive canUndo / canRedo for button disabled state
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)

  // Build a typed PATCH payload from a single field + value and apply it
  // optimistically + via API — mirrors the logic in commitCell / commitEditWithValues.
  const applyPatch: ApplyPatchFn = useCallback(async (taskId, field, value) => {
    const tasks = useTaskStore.getState().tasks
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    type PatchPayload = {
      id: string
      version: number
      name?: string
      status?: TaskStatus
      start_date?: string | null
      end_date?: string | null
      progress?: number
    }

    const patch: PatchPayload = { id: task.id, version: task.version }

    switch (field) {
      case 'name':
        if (typeof value !== 'string' || !value.trim()) return
        patch.name = value.trim()
        break
      case 'status':
        if (typeof value !== 'string') return
        patch.status = value as TaskStatus
        break
      case 'start_date':
        patch.start_date = typeof value === 'string' ? value || null : null
        break
      case 'end_date':
        patch.end_date = typeof value === 'string' ? value || null : null
        break
      case 'progress':
        if (typeof value !== 'number') return
        patch.progress = Math.min(100, Math.max(0, value))
        break
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
      if (res.ok) {
        const json = await res.json() as { data: Task }
        upsertTask(json.data)
      } else {
        // Roll back optimistic update on failure
        upsertTask(task)
      }
    } catch {
      upsertTask(task)
    }
  }, [upsertTask])

  /** Push a new command onto the undo stack and clear the redo stack. */
  const pushCommand = useCallback((cmd: UndoCommand) => {
    undoStack.current = [...undoStack.current.slice(-19), cmd] // keep ≤20
    redoStack.current = []
    setUndoCount(undoStack.current.length)
    setRedoCount(0)
  }, [])

  /** Undo the last command programmatically (also called by Cmd+Z handler). */
  const undo = useCallback(() => {
    if (isEditing()) return
    const cmd = undoStack.current[undoStack.current.length - 1]
    if (!cmd) return
    undoStack.current = undoStack.current.slice(0, -1)
    redoStack.current = [...redoStack.current.slice(-19), cmd]
    setUndoCount(undoStack.current.length)
    setRedoCount(redoStack.current.length)
    void applyPatch(cmd.taskId, cmd.field, cmd.before)
  }, [applyPatch, isEditing])

  /** Redo the last undone command programmatically (also called by Cmd+Shift+Z handler). */
  const redo = useCallback(() => {
    if (isEditing()) return
    const cmd = redoStack.current[redoStack.current.length - 1]
    if (!cmd) return
    redoStack.current = redoStack.current.slice(0, -1)
    undoStack.current = [...undoStack.current.slice(-19), cmd]
    setUndoCount(undoStack.current.length)
    setRedoCount(redoStack.current.length)
    void applyPatch(cmd.taskId, cmd.field, cmd.after)
  }, [applyPatch, isEditing])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Delegate to browser when actively editing a cell
      if (isEditing()) return

      const isMod = e.metaKey || e.ctrlKey
      if (!isMod || e.key !== 'z') return

      if (e.shiftKey) {
        // Cmd+Shift+Z → Redo
        const cmd = redoStack.current[redoStack.current.length - 1]
        if (!cmd) return
        e.preventDefault()
        redoStack.current = redoStack.current.slice(0, -1)
        undoStack.current = [...undoStack.current.slice(-19), cmd]
        setUndoCount(undoStack.current.length)
        setRedoCount(redoStack.current.length)
        void applyPatch(cmd.taskId, cmd.field, cmd.after)
      } else {
        // Cmd+Z → Undo
        const cmd = undoStack.current[undoStack.current.length - 1]
        if (!cmd) return
        e.preventDefault()
        undoStack.current = undoStack.current.slice(0, -1)
        redoStack.current = [...redoStack.current.slice(-19), cmd]
        setUndoCount(undoStack.current.length)
        setRedoCount(redoStack.current.length)
        void applyPatch(cmd.taskId, cmd.field, cmd.before)
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // isEditing is a stable ref-based getter so it needn't be in the dep array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyPatch])

  return {
    pushCommand,
    undo,
    redo,
    canUndo: undoCount > 0,
    canRedo: redoCount > 0,
  }
}

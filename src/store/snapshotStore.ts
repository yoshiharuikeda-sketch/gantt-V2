import { create } from 'zustand'
import type { Snapshot, TaskSnapshot } from '@/types'

interface SnapshotStore {
  snapshots: Snapshot[]
  activeBaselineId: string | null
  activeBaseline: Snapshot | null

  setSnapshots: (snapshots: Snapshot[]) => void
  addSnapshot: (snapshot: Snapshot) => void
  removeSnapshot: (id: string) => void
  setActiveBaseline: (id: string | null) => void
  getTaskBaseline: (taskId: string) => TaskSnapshot | null
}

export const useSnapshotStore = create<SnapshotStore>((set, get) => ({
  snapshots: [],
  activeBaselineId: null,
  activeBaseline: null,

  setSnapshots: (snapshots) => set({ snapshots }),

  addSnapshot: (snapshot) =>
    set((state) => ({ snapshots: [snapshot, ...state.snapshots] })),

  removeSnapshot: (id) =>
    set((state) => {
      const snapshots = state.snapshots.filter((s) => s.id !== id)
      const activeBaselineId = state.activeBaselineId === id ? null : state.activeBaselineId
      const activeBaseline = activeBaselineId
        ? (snapshots.find((s) => s.id === activeBaselineId) ?? null)
        : null
      return { snapshots, activeBaselineId, activeBaseline }
    }),

  setActiveBaseline: (id) =>
    set((state) => ({
      activeBaselineId: id,
      activeBaseline: id
        ? (state.snapshots.find((s) => s.id === id) ?? null)
        : null,
    })),

  getTaskBaseline: (taskId) => {
    const { activeBaseline } = get()
    if (!activeBaseline) return null
    return (
      activeBaseline.task_snapshots.find((ts) => ts.task_id === taskId) ?? null
    )
  },
}))

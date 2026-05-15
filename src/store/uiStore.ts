import { create } from 'zustand'
import type { ViewMode, ZoomLevel, GanttColKey } from '@/types'

interface UiStore {
  viewMode: ViewMode
  zoomLevel: ZoomLevel
  ganttColumns: GanttColKey[]
  collapsedPhaseIds: Set<string>

  setViewMode: (mode: ViewMode) => void
  setZoomLevel: (level: ZoomLevel) => void
  setGanttColumns: (columns: GanttColKey[]) => void
  togglePhaseCollapse: (phaseId: string) => void
}

export const useUiStore = create<UiStore>((set) => ({
  viewMode: 'gantt',
  zoomLevel: 'week',
  ganttColumns: ['name', 'start_date', 'end_date', 'progress'],
  collapsedPhaseIds: new Set<string>(),

  setViewMode: (viewMode) => set({ viewMode }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel }),
  setGanttColumns: (ganttColumns) => set({ ganttColumns }),
  togglePhaseCollapse: (phaseId) =>
    set((state) => {
      const next = new Set(state.collapsedPhaseIds)
      if (next.has(phaseId)) next.delete(phaseId)
      else next.add(phaseId)
      return { collapsedPhaseIds: next }
    }),
}))

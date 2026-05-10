import { create } from 'zustand'
import type { ViewMode, ZoomLevel, GanttColKey } from '@/types'

interface UiStore {
  viewMode: ViewMode
  zoomLevel: ZoomLevel
  ganttColumns: GanttColKey[]

  setViewMode: (mode: ViewMode) => void
  setZoomLevel: (level: ZoomLevel) => void
  setGanttColumns: (columns: GanttColKey[]) => void
}

export const useUiStore = create<UiStore>((set) => ({
  viewMode: 'gantt',
  zoomLevel: 'week',
  ganttColumns: ['name', 'start_date', 'end_date', 'progress'],

  setViewMode: (viewMode) => set({ viewMode }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel }),
  setGanttColumns: (ganttColumns) => set({ ganttColumns }),
}))

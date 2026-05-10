import { create } from 'zustand'
import type { Task, Phase } from '@/types'

interface TaskStore {
  tasks: Task[]
  phases: Phase[]

  setTasks: (tasks: Task[]) => void
  setPhases: (phases: Phase[]) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  addTask: (task: Task) => void
  removeTask: (id: string) => void
  upsertTask: (task: Task) => void
  reorderTasks: (orderedIds: string[]) => void
  addPhase: (phase: Phase) => void
  upsertPhase: (phase: Phase) => void
  removePhase: (id: string) => void
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  phases: [],

  setTasks: (tasks) => set({ tasks }),
  setPhases: (phases) => set({ phases }),

  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  addTask: (task) =>
    set((state) => ({ tasks: [...state.tasks, task] })),

  removeTask: (id) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

  upsertTask: (task) =>
    set((state) => {
      const exists = state.tasks.some((t) => t.id === task.id)
      return {
        tasks: exists
          ? state.tasks.map((t) => (t.id === task.id ? task : t))
          : [...state.tasks, task],
      }
    }),

  reorderTasks: (orderedIds) =>
    set((state) => {
      const taskMap = new Map(state.tasks.map((t) => [t.id, t]))
      const reordered = orderedIds
        .map((id, index) => {
          const task = taskMap.get(id)
          return task ? { ...task, display_order: index } : null
        })
        .filter(Boolean) as Task[]
      return { tasks: reordered }
    }),

  addPhase: (phase) =>
    set((state) => ({ phases: [...state.phases, phase] })),

  upsertPhase: (phase) =>
    set((state) => {
      const exists = state.phases.some((p) => p.id === phase.id)
      return {
        phases: exists
          ? state.phases.map((p) => (p.id === phase.id ? phase : p))
          : [...state.phases, phase],
      }
    }),

  removePhase: (id) =>
    set((state) => ({ phases: state.phases.filter((p) => p.id !== id) })),
}))

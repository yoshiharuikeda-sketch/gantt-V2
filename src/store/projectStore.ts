import { create } from 'zustand'
import type { Project, UserRole, UserPermissions, MemberWithProfile } from '@/types'

interface ProjectStore {
  projects: Project[]
  currentProject: Project | null
  members: MemberWithProfile[]
  currentUserRole: UserRole | null
  currentUserId: string | null
  permissions: UserPermissions | null

  setProjects: (projects: Project[]) => void
  setCurrentProject: (project: Project | null) => void
  setMembers: (members: MemberWithProfile[]) => void
  setCurrentUserRole: (role: UserRole | null) => void
  setCurrentUserId: (id: string | null) => void
  setPermissions: (permissions: UserPermissions | null) => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  currentProject: null,
  members: [],
  currentUserRole: null,
  currentUserId: null,
  permissions: null,

  setProjects: (projects) => set({ projects }),
  setCurrentProject: (currentProject) => set({ currentProject }),
  setMembers: (members) => set({ members }),
  setCurrentUserRole: (currentUserRole) => set({ currentUserRole }),
  setCurrentUserId: (currentUserId) => set({ currentUserId }),
  setPermissions: (permissions) => set({ permissions }),
}))

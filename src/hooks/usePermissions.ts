'use client'

import { useProjectStore } from '@/store/projectStore'
import type { UserPermissions } from '@/types'

const DEFAULT_PERMISSIONS: UserPermissions = {
  role: 'viewer',
  canEdit: false,
  canDelete: false,
  canManageMembers: false,
  canInviteMembers: false,
  canCreateSnapshot: false,
  canAccessSettings: false,
  isVendor: false,
  visibleTaskIds: null,
}

export function usePermissions(): UserPermissions {
  const permissions = useProjectStore((s) => s.permissions)
  return permissions ?? DEFAULT_PERMISSIONS
}

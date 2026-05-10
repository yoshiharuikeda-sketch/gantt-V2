'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Task, MemberWithProfile } from '@/types'

interface VendorTaskAssignmentProps {
  tasks: Task[]
  vendorMembers: MemberWithProfile[]
  onAssign: (taskId: string, vendorId: string | null) => Promise<void>
}

export function VendorTaskAssignment({
  tasks,
  vendorMembers,
  onAssign,
}: VendorTaskAssignmentProps) {
  const [loadingTaskIds, setLoadingTaskIds] = useState<Set<string>>(new Set())
  const [errorTaskIds, setErrorTaskIds] = useState<Map<string, string>>(new Map())

  async function handleAssign(taskId: string, value: string | null) {
    const vendorId = value === '__none__' || value === null ? null : value
    setLoadingTaskIds((prev) => new Set(prev).add(taskId))
    setErrorTaskIds((prev) => {
      const next = new Map(prev)
      next.delete(taskId)
      return next
    })
    try {
      await onAssign(taskId, vendorId)
    } catch (err) {
      console.error('Failed to assign vendor to task:', err)
      const message = err instanceof Error ? err.message : '割当に失敗しました'
      setErrorTaskIds((prev) => new Map(prev).set(taskId, message))
    } finally {
      setLoadingTaskIds((prev) => {
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
    }
  }

  return (
    <ScrollArea className="max-h-80">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>タスク名</TableHead>
            <TableHead>担当ベンダー</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <TableRow key={task.id}>
              <TableCell className="font-medium">{task.name}</TableCell>
              <TableCell>
                <div className="space-y-1">
                  <Select
                    value={task.vendor_id ?? '__none__'}
                    onValueChange={(value) => handleAssign(task.id, value as string | null)}
                    disabled={loadingTaskIds.has(task.id)}
                  >
                    <SelectTrigger size="sm" className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">未割当</SelectItem>
                      {vendorMembers.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.profiles?.display_name ?? member.profiles?.email ?? member.user_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errorTaskIds.get(task.id) && (
                    <p className="text-xs text-destructive">{errorTaskIds.get(task.id)}</p>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {tasks.length === 0 && (
            <TableRow>
              <TableCell colSpan={2} className="text-center text-muted-foreground py-6">
                タスクがありません
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}

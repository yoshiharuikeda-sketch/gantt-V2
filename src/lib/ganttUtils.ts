import { differenceInDays, parseISO, addDays } from 'date-fns'
import type { Task, ZoomLevel } from '@/types'

export const DAY_WIDTH_MAP: Record<ZoomLevel, number> = {
  day: 40,
  week: 14,
  month: 5,
}

export function getBarX(
  dateStr: string,
  timelineStart: Date,
  dayWidth: number
): number {
  const date = parseISO(dateStr)
  return differenceInDays(date, timelineStart) * dayWidth
}

export function getBarWidth(
  startDateStr: string,
  endDateStr: string,
  dayWidth: number
): number {
  const start = parseISO(startDateStr)
  const end = parseISO(endDateStr)
  const days = differenceInDays(end, start) + 1
  return Math.max(days * dayWidth, dayWidth)
}

export function getDateFromX(
  x: number,
  timelineStart: Date,
  dayWidth: number
): Date {
  const days = Math.round(x / dayWidth)
  return addDays(timelineStart, days)
}

export function getTimelineRange(tasks: Task[]): { start: Date; end: Date } {
  const dates = tasks
    .flatMap((t) => [t.start_date, t.end_date])
    .filter(Boolean) as string[]

  if (dates.length === 0) {
    const now = new Date()
    return { start: addDays(now, -14), end: addDays(now, 60) }
  }

  const parsed = dates.map((d) => parseISO(d))
  const min = new Date(Math.min(...parsed.map((d) => d.getTime())))
  const max = new Date(Math.max(...parsed.map((d) => d.getTime())))

  return {
    start: addDays(min, -7),
    end: addDays(max, 14),
  }
}

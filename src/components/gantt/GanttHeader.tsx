'use client'

import { useMemo } from 'react'
import {
  format,
  addDays,
  differenceInDays,
} from '@/lib/utils/dateUtils'
import { eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, isToday } from 'date-fns'
import type { ZoomLevel } from '@/types'

interface GanttHeaderProps {
  timelineStart: Date
  totalDays: number
  dayWidth: number
  zoomLevel: ZoomLevel
}

interface ColItem {
  key: string
  label: string
  sublabel: string
  x: number
  width: number
  highlight: boolean
}

export function GanttHeader({ timelineStart, totalDays, dayWidth, zoomLevel }: GanttHeaderProps) {
  const columns = useMemo((): ColItem[] => {
    const timelineEnd = addDays(timelineStart, totalDays)
    if (zoomLevel === 'day') {
      return eachDayOfInterval({ start: timelineStart, end: timelineEnd }).map((d) => ({
        key: d.toISOString(),
        label: format(d, 'd'),
        sublabel: format(d, 'M月'),
        x: differenceInDays(d, timelineStart) * dayWidth,
        width: dayWidth,
        highlight: isToday(d),
      }))
    }
    if (zoomLevel === 'week') {
      return eachWeekOfInterval({ start: timelineStart, end: timelineEnd }, { weekStartsOn: 1 }).map((d) => ({
        key: d.toISOString(),
        label: format(d, 'M/d'),
        sublabel: format(d, 'yyyy年M月'),
        x: differenceInDays(d, timelineStart) * dayWidth,
        width: dayWidth * 7,
        highlight: false,
      }))
    }
    return eachMonthOfInterval({ start: timelineStart, end: timelineEnd }).map((d) => ({
      key: d.toISOString(),
      label: format(d, 'M月'),
      sublabel: format(d, 'yyyy年'),
      x: differenceInDays(d, timelineStart) * dayWidth,
      width: dayWidth * 30,
      highlight: false,
    }))
  }, [zoomLevel, timelineStart, totalDays, dayWidth])

  const showSublabel = zoomLevel !== 'month'
  const totalWidth = totalDays * dayWidth

  return (
    <div className="relative bg-slate-50 border-b border-slate-200" style={{ width: totalWidth, height: 56 }}>
      {showSublabel && (
        <div className="absolute top-0 left-0 right-0 h-6 pointer-events-none">
          {columns
            .filter((col, i) => i === 0 || col.sublabel !== columns[i - 1].sublabel)
            .map((col) => (
              <div
                key={col.key}
                className="absolute top-0 text-xs text-slate-400 font-medium pl-1 pt-0.5"
                style={{ left: col.x }}
              >
                {col.sublabel}
              </div>
            ))}
        </div>
      )}
      <div
        className="absolute left-0 right-0 bottom-0"
        style={{ top: showSublabel ? 24 : 0 }}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            className={`absolute bottom-0 top-0 flex items-center justify-center border-r border-slate-200 text-xs font-medium ${
              col.highlight ? 'text-blue-600 bg-blue-50' : 'text-slate-500'
            }`}
            style={{ left: col.x, width: col.width }}
          >
            {col.label}
          </div>
        ))}
      </div>
    </div>
  )
}

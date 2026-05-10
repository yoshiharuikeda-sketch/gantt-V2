import { ja } from 'date-fns/locale'
import {
  format,
  differenceInDays,
  addDays,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  isValid,
  parseISO,
} from 'date-fns'

export {
  format,
  differenceInDays,
  addDays,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  isValid,
  parseISO,
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'yyyy/MM/dd', { locale: ja })
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'M/d', { locale: ja })
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'yyyy/MM/dd HH:mm', { locale: ja })
}

export function toDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

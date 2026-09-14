const TIME_ZONE = 'Asia/Shanghai'

function getZonedParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) {
    map[part.type] = part.value
  }
  return {
    year: map.year ?? '2026',
    month: map.month ?? '01',
    day: map.day ?? '01',
    hour: map.hour ?? '00',
    minute: map.minute ?? '00',
  }
}

function getZonedWeekday(date: Date): string {
  // In Asia/Shanghai, get weekday
  const weekdayStr = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE,
    weekday: 'short',
  }).format(date)
  return weekdayStr
}

export function isSameZonedDay(aIso: string, bIso: string): boolean {
  const aParts = getZonedParts(new Date(aIso))
  const bParts = getZonedParts(new Date(bIso))
  return (
    aParts.year === bParts.year &&
    aParts.month === bParts.month &&
    aParts.day === bParts.day
  )
}

export function formatZonedYMD(iso: string): string {
  const { year, month, day } = getZonedParts(new Date(iso))
  return `${year}.${month}.${day}`
}

export function formatZonedMD(iso: string): string {
  const { month, day } = getZonedParts(new Date(iso))
  return `${month}.${day}`
}

export function formatZonedHM(iso: string): string {
  const { hour, minute } = getZonedParts(new Date(iso))
  return `${hour}:${minute}`
}

export function formatZonedWeekday(iso: string): string {
  return getZonedWeekday(new Date(iso))
}

export function formatZonedFullDateTime(iso: string): string {
  return `${new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: TIME_ZONE,
  }).format(new Date(iso))}（中国标准时间）`
}

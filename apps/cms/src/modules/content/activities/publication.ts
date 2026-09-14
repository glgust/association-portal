import {
  hasMeaningfulPublicText,
  toPublicRichText,
} from '@/modules/content/shared/public-rich-text'

export type ActivityPublicationCandidate = {
  activityType?: unknown
  body?: unknown
  cancellationNote?: unknown
  endsAt?: unknown
  isCancelled?: unknown
  location?: unknown
  scheduleText?: unknown
  startsAt?: unknown
  summary?: unknown
  title?: unknown
}

export type ActivityPublicationIssue = {
  message: string
  path: keyof ActivityPublicationCandidate
}

const singleLineControlCharacter = /[\u0000-\u001f\u007f]/
const multilineControlCharacter =
  /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/

function trimmedText(
  value: unknown,
  path: keyof ActivityPublicationCandidate,
  maximum: number,
  required: boolean,
  multiline: boolean,
  issues: ActivityPublicationIssue[],
): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) issues.push({ message: '该字段为必填项。', path })
    return null
  }
  if (typeof value !== 'string') {
    issues.push({ message: '该字段必须是文本。', path })
    return null
  }
  const result = multiline ? value.replace(/\r\n?/g, '\n').trim() : value.trim()
  const invalidControlCharacter = multiline
    ? multilineControlCharacter.test(result)
    : singleLineControlCharacter.test(result)
  if (
    (required && !result) ||
    result.length > maximum ||
    invalidControlCharacter
  ) {
    issues.push({
      message: `该字段必须为 1–${maximum} 个无控制字符的字符。`,
      path,
    })
    return null
  }
  return result || null
}

function zonedInstant(
  value: unknown,
  path: 'endsAt' | 'startsAt',
  required: boolean,
  issues: ActivityPublicationIssue[],
): number | null {
  if (value === undefined || value === null || value === '') {
    if (required) issues.push({ message: '该时间为必填项。', path })
    return null
  }
  if (
    typeof value !== 'string' ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    issues.push({ message: '该字段必须是带时区的有效时间。', path })
    return null
  }
  return Date.parse(value)
}

export function validateActivityForPublication(
  candidate: ActivityPublicationCandidate,
): ActivityPublicationIssue[] {
  const issues: ActivityPublicationIssue[] = []

  trimmedText(candidate.title, 'title', 120, true, false, issues)
  trimmedText(candidate.summary, 'summary', 240, false, true, issues)
  trimmedText(candidate.location, 'location', 200, true, false, issues)

  if (
    candidate.activityType !== 'temporary' &&
    candidate.activityType !== 'standing'
  ) {
    issues.push({ message: '活动类型无效。', path: 'activityType' })
  } else if (candidate.activityType === 'temporary') {
    const startsAt = zonedInstant(candidate.startsAt, 'startsAt', true, issues)
    const endsAt = zonedInstant(candidate.endsAt, 'endsAt', true, issues)
    if (startsAt !== null && endsAt !== null && startsAt >= endsAt) {
      issues.push({ message: '结束时间必须晚于开始时间。', path: 'endsAt' })
    }
    if (
      candidate.scheduleText !== undefined &&
      candidate.scheduleText !== null &&
      candidate.scheduleText !== ''
    ) {
      issues.push({
        message: '临时活动不得填写常驻开放时间。',
        path: 'scheduleText',
      })
    }
  } else if (candidate.activityType === 'standing') {
    trimmedText(candidate.scheduleText, 'scheduleText', 240, true, true, issues)
    for (const path of ['startsAt', 'endsAt'] as const) {
      if (
        candidate[path] !== undefined &&
        candidate[path] !== null &&
        candidate[path] !== ''
      ) {
        issues.push({ message: '常驻活动不得填写开始或结束时间。', path })
      }
    }
  }

  if (typeof candidate.isCancelled !== 'boolean') {
    issues.push({ message: '取消状态无效。', path: 'isCancelled' })
  } else if (candidate.isCancelled) {
    trimmedText(
      candidate.cancellationNote,
      'cancellationNote',
      500,
      true,
      true,
      issues,
    )
  } else if (
    candidate.cancellationNote !== undefined &&
    candidate.cancellationNote !== null &&
    candidate.cancellationNote !== ''
  ) {
    issues.push({
      message: '未取消的活动不得填写取消说明。',
      path: 'cancellationNote',
    })
  }

  try {
    const body = toPublicRichText(candidate.body)
    if (!hasMeaningfulPublicText(body)) throw new Error('empty body')
  } catch {
    issues.push({
      message: '正文包含不支持的内容，或没有有意义的文字。',
      path: 'body',
    })
  }

  return issues
}

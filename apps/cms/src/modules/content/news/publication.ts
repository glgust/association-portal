import {
  hasMeaningfulPublicText,
  toPublicRichText,
} from '@/modules/content/shared/public-rich-text'

export type NewsPublicationCandidate = {
  body?: unknown
  summary?: unknown
  title?: unknown
}

export type NewsPublicationIssue = {
  message: string
  path: keyof NewsPublicationCandidate
}

const singleLineControlCharacter = /[\u0000-\u001f\u007f]/

export function normalizeNewsText(
  value: unknown,
  path: 'summary' | 'title',
): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  if (!normalized) return null
  if (singleLineControlCharacter.test(normalized)) return null
  const maximum = path === 'title' ? 120 : 240
  if (normalized.length > maximum) return null
  return normalized
}

export function validateNewsForPublication(
  candidate: NewsPublicationCandidate,
): NewsPublicationIssue[] {
  const issues: NewsPublicationIssue[] = []
  if (normalizeNewsText(candidate.title, 'title') === null) {
    issues.push({
      message: '标题必须为 1–120 个无控制字符的单行文字。',
      path: 'title',
    })
  }
  if (
    candidate.summary !== undefined &&
    candidate.summary !== null &&
    candidate.summary !== '' &&
    !(
      typeof candidate.summary === 'string' &&
      candidate.summary.normalize('NFKC').trim() === ''
    ) &&
    normalizeNewsText(candidate.summary, 'summary') === null
  ) {
    issues.push({
      message: '摘要必须为不超过 240 个无控制字符的单行文字。',
      path: 'summary',
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

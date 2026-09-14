import { randomBytes } from 'node:crypto'

export function createContentSlug(title: string, fallback: string): string {
  const base = title
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')

  return `${base || fallback}-${randomBytes(4).toString('hex')}`
}

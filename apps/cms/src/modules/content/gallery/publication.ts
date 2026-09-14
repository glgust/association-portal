const controlCharacter = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/

export type GalleryPublicationIssue = {
  message: string
  path:
    | 'altText'
    | 'author'
    | 'displayRightsConfirmed'
    | 'media'
    | 'penName'
    | 'recognizablePeople'
    | 'summary'
    | 'title'
}

export type GalleryAuthorIdentity = {
  displayName?: null | string
  studentNumber?: null | string
  username?: null | string
}

export function normalizeGalleryText(
  value: unknown,
  maximum: number,
): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  if (!normalized || normalized.length > maximum) return null
  return controlCharacter.test(normalized) ? null : normalized
}

export function normalizeOptionalGalleryText(
  value: unknown,
  maximum: number,
): string | null | undefined {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'string' && value.normalize('NFKC').trim() === '') {
    return null
  }
  return normalizeGalleryText(value, maximum) ?? undefined
}

function normalizedComparison(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
}

export function publicAuthorNameFor(
  author: GalleryAuthorIdentity,
  penName: null | string,
): string | null {
  const candidate = penName ?? normalizeGalleryText(author.displayName, 100)
  if (!candidate) return null

  const normalizedCandidate = normalizedComparison(candidate)
  const username = normalizeGalleryText(author.username, 100)
  const studentNumber = normalizeGalleryText(author.studentNumber, 100)
  if (
    username &&
    (normalizedCandidate === normalizedComparison(username) ||
      normalizedCandidate.includes(normalizedComparison(username)))
  ) {
    return null
  }
  if (
    studentNumber &&
    (normalizedCandidate === normalizedComparison(studentNumber) ||
      normalizedCandidate.includes(normalizedComparison(studentNumber)))
  ) {
    return null
  }
  return candidate
}

type MediaVariant = {
  byteSize?: unknown
  height?: unknown
  mimeType?: unknown
  objectKey?: unknown
  sha256?: unknown
  width?: unknown
}

export type MediaAssetCandidate = MediaVariant & {
  display?: MediaVariant
  detail?: MediaVariant
  id?: unknown
  list?: MediaVariant
  objectPrefix?: unknown
  thumbnail?: MediaVariant
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function isCompleteVariant(
  value: MediaVariant | undefined,
  prefix: string,
  name: 'detail' | 'display' | 'list' | 'thumbnail',
): boolean {
  return Boolean(
    value &&
      value.mimeType === 'image/webp' &&
      value.objectKey === `media/${prefix}/${name}.webp` &&
      typeof value.sha256 === 'string' &&
      /^[0-9a-f]{64}$/.test(value.sha256) &&
      isPositiveInteger(value.width) &&
      Number(value.width) <= 16_384 &&
      isPositiveInteger(value.height) &&
      Number(value.height) <= 16_384 &&
      isPositiveInteger(value.byteSize),
  )
}

export function isCompleteMediaAsset(
  value: MediaAssetCandidate | null | undefined,
): value is MediaAssetCandidate & { objectPrefix: string } {
  if (!value || typeof value.objectPrefix !== 'string') return false
  const prefix = value.objectPrefix
  if (!/^[0-9a-f-]{36}$/.test(prefix)) return false
  return (
    value.mimeType === 'image/webp' &&
    typeof value.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    isPositiveInteger(value.width) &&
    Number(value.width) <= 16_384 &&
    isPositiveInteger(value.height) &&
    Number(value.height) <= 16_384 &&
    isPositiveInteger(value.byteSize) &&
    isCompleteVariant(value.display, prefix, 'display') &&
    isCompleteVariant(value.detail, prefix, 'detail') &&
    isCompleteVariant(value.list, prefix, 'list') &&
    isCompleteVariant(value.thumbnail, prefix, 'thumbnail')
  )
}

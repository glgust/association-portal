import type { Payload, PayloadRequest } from 'payload'
import { z } from 'zod'

import { authorize } from '@/modules/authorization/authorize'
import { loadActor } from '@/modules/authorization/load-actor'
import { BusinessError } from '@/modules/shared/business-error'

import {
  normalizeGalleryText,
  normalizeOptionalGalleryText,
  publicAuthorNameFor,
} from './publication'

const galleryAuthorCandidateSchema = z
  .object({
    displayName: z.string().min(1).max(100).nullable(),
    id: z.string().uuid(),
    statusHint: z.enum(['penNameRequired', 'ready']),
  })
  .strict()

export const galleryAuthorCandidatesSchema = z
  .object({
    hasNextPage: z.boolean(),
    items: z.array(galleryAuthorCandidateSchema),
    page: z.number().int().positive(),
  })
  .strict()

export const galleryAuthorPreviewRequestSchema = z
  .object({
    authorId: z.string().uuid(),
    penName: z.string().max(100).nullable(),
  })
  .strict()

export const galleryAuthorPreviewSchema = z.discriminatedUnion('status', [
  z
    .object({
      authorName: z.string().min(1).max(100),
      status: z.literal('ready'),
    })
    .strict(),
  z.object({ status: z.literal('invalid') }).strict(),
])

export type GalleryAuthorCandidate = z.infer<
  typeof galleryAuthorCandidateSchema
>

type CandidateDocument = {
  displayName?: null | string
  id: string
  studentNumber?: null | string
  username?: null | string
}

function toCandidate(doc: CandidateDocument): GalleryAuthorCandidate {
  const displayName = normalizeGalleryText(doc.displayName, 100)
  const canPublishDisplayName = publicAuthorNameFor(doc, null) !== null
  return {
    displayName: canPublishDisplayName ? displayName : null,
    id: doc.id,
    statusHint:
      displayName && canPublishDisplayName ? 'ready' : 'penNameRequired',
  }
}

async function requireGalleryCandidateAccess(
  payload: Payload,
  req: PayloadRequest,
): Promise<{ actorId: string; canManageAccounts: boolean }> {
  const actor = await loadActor(payload, req)
  if (!actor) {
    throw new BusinessError(
      req.user ? 'FORBIDDEN' : 'UNAUTHENTICATED',
      req.user ? 'Forbidden' : 'Authentication required',
      req.user ? 403 : 401,
    )
  }
  const now = new Date()
  const canUseGallery =
    authorize(actor, 'content.create', { type: 'global' }, now).allowed ||
    authorize(actor, 'content.edit', { type: 'global' }, now).allowed
  if (!canUseGallery) throw new BusinessError('FORBIDDEN', 'Forbidden', 403)
  return {
    actorId: actor.id,
    canManageAccounts: authorize(
      actor,
      'accounts.manage',
      { type: 'global' },
      now,
    ).allowed,
  }
}

export async function listGalleryAuthorCandidates(
  payload: Payload,
  req: PayloadRequest,
  requestedPage = 1,
  requestedSearch = '',
): Promise<{
  hasNextPage: boolean
  items: GalleryAuthorCandidate[]
  page: number
}> {
  const { actorId, canManageAccounts } = await requireGalleryCandidateAccess(
    payload,
    req,
  )
  const trimmedSearch = requestedSearch.normalize('NFKC').trim()
  const search = trimmedSearch ? normalizeGalleryText(trimmedSearch, 100) : null
  if (trimmedSearch && !search) {
    throw new BusinessError('VALIDATION_FAILED', 'Invalid search', 400)
  }

  const page = canManageAccounts ? requestedPage : 1
  const result = await payload.find({
    collection: 'auth-users',
    depth: 0,
    limit: canManageAccounts ? 50 : 1,
    overrideAccess: true,
    page,
    req,
    select: {
      displayName: true,
      id: true,
      studentNumber: true,
      username: true,
    },
    sort: ['displayName', 'id'],
    where: canManageAccounts
      ? search
        ? { displayName: { contains: search } }
        : {}
      : { id: { equals: actorId } },
  })
  return galleryAuthorCandidatesSchema.parse({
    hasNextPage: canManageAccounts && result.hasNextPage === true,
    items: (result.docs as CandidateDocument[]).map(toCandidate),
    page,
  })
}

export async function previewGalleryAuthorName(
  payload: Payload,
  req: PayloadRequest,
  input: z.infer<typeof galleryAuthorPreviewRequestSchema>,
): Promise<z.infer<typeof galleryAuthorPreviewSchema>> {
  const { actorId, canManageAccounts } = await requireGalleryCandidateAccess(
    payload,
    req,
  )
  if (!canManageAccounts && input.authorId !== actorId) {
    throw new BusinessError('FORBIDDEN', 'Forbidden', 403)
  }
  const penName = normalizeOptionalGalleryText(input.penName, 100)
  if (penName === undefined) return { status: 'invalid' }
  const result = await payload.find({
    collection: 'auth-users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    select: {
      displayName: true,
      studentNumber: true,
      username: true,
    },
    where: { id: { equals: input.authorId } },
  })
  const author = result.docs[0] as CandidateDocument | undefined
  const authorName = author
    ? publicAuthorNameFor(author, penName ?? null)
    : null
  return galleryAuthorPreviewSchema.parse(
    authorName ? { authorName, status: 'ready' } : { status: 'invalid' },
  )
}

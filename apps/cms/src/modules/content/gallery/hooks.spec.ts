import { describe, expect, it, vi } from 'vitest'

import { auditGalleryPublication, prepareGalleryChange } from './hooks'

const publisherId = '10000000-0000-4000-8000-000000000001'
const authorId = '20000000-0000-4000-8000-000000000002'
const mediaId = '30000000-0000-4000-8000-000000000003'
const prefix = '40000000-0000-4000-8000-000000000004'

function variant(name: string) {
  return {
    byteSize: 128,
    height: 600,
    mimeType: 'image/webp',
    objectKey: `media/${prefix}/${name}.webp`,
    sha256: 'a'.repeat(64),
    width: 900,
  }
}

const completeMedia = {
  ...variant('display'),
  detail: variant('detail'),
  display: variant('display'),
  id: mediaId,
  list: variant('list'),
  objectPrefix: prefix,
  thumbnail: variant('thumbnail'),
}

function req(input?: {
  accountOverrides?: unknown[]
  defaultRoleExpiresAt?: string
  galleryPublished?: boolean
  role?: 'member' | 'owner' | 'staff'
  status?: 'active' | 'disabled'
}) {
  const create = vi.fn(async () => ({ id: 'audit' }))
  const find = vi.fn(async ({ collection }: { collection: string }) => {
    if (collection === 'permission-overrides') {
      return { docs: input?.accountOverrides ?? [] }
    }
    if (collection === 'media-assets') return { docs: [completeMedia] }
    if (collection === 'auth-users') {
      return {
        docs: [
          {
            displayName: '虚构作者显示名',
            studentNumber: '209900000001',
            username: 'fictional-author-login',
          },
        ],
      }
    }
    if (collection === 'gallery-works') {
      return { docs: input?.galleryPublished ? [{ id: 'work' }] : [] }
    }
    return { docs: [] }
  })
  return {
    create,
    find,
    req: {
      context: {},
      headers: new Headers({ 'x-request-id': 'gallery-hook-test' }),
      payload: { create, find },
      query: {},
      t: vi.fn((key: string) => key),
      user: {
        collection: 'auth-users',
        defaultRoleExpiresAt: input?.defaultRoleExpiresAt,
        id: publisherId,
        role: input?.role ?? 'owner',
        status: input?.status ?? 'active',
      },
    },
  }
}

const original = {
  altText: '虚构星云替代文本',
  author: authorId,
  createdBy: publisherId,
  displayRightsConfirmed: true,
  id: '50000000-0000-4000-8000-000000000005',
  media: mediaId,
  penName: null,
  publicAuthorName: '旧公开署名',
  publishedAt: '2026-08-26T00:00:00.000Z',
  recognizablePeople: 'none' as const,
  slug: 'fictional-gallery-work',
  summary: '虚构摘要',
  title: '虚构星云作品',
}

describe('Gallery publication hooks', () => {
  it('publishes with author/publisher separation and a safe display-name snapshot', async () => {
    const context = req()
    const data = await prepareGalleryChange({
      data: {
        _status: 'published',
        altText: original.altText,
        author: authorId,
        displayRightsConfirmed: true,
        media: mediaId,
        recognizablePeople: 'none',
        summary: original.summary,
        title: original.title,
      },
      operation: 'update',
      originalDoc: original,
      req: context.req,
    } as never)

    expect(data).toMatchObject({
      _status: 'published',
      author: authorId,
      lastEditedBy: publisherId,
      publicAuthorName: '虚构作者显示名',
    })
    await auditGalleryPublication({
      doc: { ...data, id: original.id },
      req: context.req,
    } as never)
    expect(context.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actor: publisherId,
          targetId: original.id,
        }),
      }),
    )
  })

  it.each([
    [
      'missing directPublish',
      {
        accountOverrides: [
          {
            effect: 'allow',
            id: 'create-only',
            permission: 'content.create',
            scopeType: 'global',
          },
        ],
        role: 'member' as const,
      },
    ],
    [
      'expired default role',
      {
        defaultRoleExpiresAt: '2000-01-01T00:00:00.000Z',
        role: 'staff' as const,
      },
    ],
    ['disabled actor', { role: 'owner' as const, status: 'disabled' as const }],
    [
      'illegal override scope',
      {
        accountOverrides: [
          {
            effect: 'allow',
            id: 'illegal-scope',
            permission: 'content.directPublish',
            recruitmentCycle: 'cycle-id',
            scopeType: 'recruitmentCycle',
          },
        ],
        role: 'member' as const,
      },
    ],
  ])('rejects %s before publication', async (_name, actorInput) => {
    const context = req(actorInput)
    await expect(
      prepareGalleryChange({
        data: {
          _status: 'published',
          altText: original.altText,
          author: publisherId,
          displayRightsConfirmed: true,
          media: mediaId,
          recognizablePeople: 'none',
          title: original.title,
        },
        operation: 'update',
        originalDoc: { ...original, author: publisherId },
        req: context.req,
      } as never),
    ).rejects.toBeTruthy()
    expect(context.create).not.toHaveBeenCalled()
  })

  it('rejects unpublish when no current published version exists', async () => {
    const context = req({ galleryPublished: false })
    await expect(
      prepareGalleryChange({
        data: { _status: 'draft' },
        operation: 'update',
        originalDoc: original,
        req: context.req,
      } as never),
    ).rejects.toBeTruthy()
    expect(context.create).not.toHaveBeenCalled()
  })

  it('keeps the old public snapshot while a replacement image remains draft', async () => {
    const context = req()
    context.req.query = { draft: 'true' }
    const data = await prepareGalleryChange({
      data: { media: '60000000-0000-4000-8000-000000000006' },
      operation: 'update',
      originalDoc: original,
      req: context.req,
    } as never)
    expect(data).toMatchObject({
      displayRightsConfirmed: false,
      publicAuthorName: original.publicAuthorName,
      publishedAt: original.publishedAt,
      recognizablePeople: null,
    })
  })

  it('propagates audit failure and always clears private operation context', async () => {
    const context = req()
    const data = await prepareGalleryChange({
      data: {
        _status: 'published',
        altText: original.altText,
        author: authorId,
        displayRightsConfirmed: true,
        media: mediaId,
        recognizablePeople: 'none',
        title: original.title,
      },
      operation: 'update',
      originalDoc: original,
      req: context.req,
    } as never)
    context.create.mockRejectedValueOnce(new Error('fictional audit failure'))
    await expect(
      auditGalleryPublication({ doc: data, req: context.req } as never),
    ).rejects.toThrow('fictional audit failure')
    expect(context.req.context).not.toHaveProperty('galleryPublicationAction')
    expect(context.req.context).not.toHaveProperty('galleryPublicationTime')
    expect(context.req.context).not.toHaveProperty('auditOperation')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  loadActor: vi.fn(),
}))

vi.mock('@/modules/authorization/authorize', () => ({
  authorize: mocks.authorize,
}))
vi.mock('@/modules/authorization/load-actor', () => ({
  loadActor: mocks.loadActor,
}))

import { prepareAssociationPageChange } from '@/modules/content/association-pages/hooks'

const actor = { id: 'actor-1' }
const contactId = 'f891a717-39b0-4752-ac1b-6e2be154cea9'

function body(text = '协会内容') {
  return {
    root: {
      children: [
        {
          children: [{ format: 0, text, type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'root',
    },
  }
}

function request(options?: { draft?: boolean; existing?: unknown[] }) {
  return {
    context: {},
    headers: new Headers(),
    payload: {
      create: vi.fn(),
      find: vi.fn().mockResolvedValue({ docs: options?.existing ?? [] }),
    },
    query: options?.draft ? { draft: 'true' } : {},
    t: vi.fn((key: string) => key),
  }
}

function contact(overrides: Record<string, unknown> = {}) {
  return {
    contactId,
    id: 'row-1',
    isPublic: true,
    label: '协会邮箱',
    showOnHome: true,
    type: 'email',
    value: 'public@example.test',
    ...overrides,
  }
}

beforeEach(() => {
  mocks.loadActor.mockReset()
  mocks.loadActor.mockResolvedValue(actor)
  mocks.authorize.mockReset()
  mocks.authorize.mockReturnValue({ allowed: true })
})

describe('association page change hook', () => {
  it('creates incomplete drafts with a home-only hidden contact and does not require publish permission', async () => {
    const req = request({ draft: true })
    const data = {
      contacts: [
        contact({
          contactId: '44baef57-4b1a-4a59-b6a1-aa46aafdddc1',
          id: undefined,
          isPublic: false,
          label: '',
          showOnHome: true,
          value: '',
        }),
      ],
      pageKey: 'contact',
    }

    const result = await prepareAssociationPageChange({
      data,
      operation: 'create',
      req,
    } as never)

    expect(result.contacts?.[0]?.contactId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/i,
    )
    expect(result.contacts?.[0]?.contactId).not.toBe(
      '44baef57-4b1a-4a59-b6a1-aa46aafdddc1',
    )
    expect(result).toMatchObject({
      createdBy: actor.id,
      lastEditedBy: actor.id,
    })
    expect(mocks.authorize).not.toHaveBeenCalled()
  })

  it('rejects direct publication and publishing the saved invalid draft before publication state is recorded', async () => {
    const directReq = request()
    await expect(
      prepareAssociationPageChange({
        data: {
          body: body(),
          contacts: [contact({ isPublic: false, showOnHome: true })],
          pageKey: 'contact',
          title: '联系方式',
        },
        operation: 'create',
        req: directReq,
      } as never),
    ).rejects.toThrow()
    expect(directReq.context).toEqual({})
    expect(directReq.payload.create).not.toHaveBeenCalled()

    const savedDraft = {
      _status: 'draft' as const,
      body: body(),
      contacts: [contact({ isPublic: false, showOnHome: true })],
      createdBy: 'creator-1',
      pageKey: 'contact',
      title: '联系方式草稿',
    }
    const originalSnapshot = structuredClone(savedDraft)
    const publishReq = request()

    await expect(
      prepareAssociationPageChange({
        data: { _status: 'published' },
        operation: 'update',
        originalDoc: savedDraft,
        req: publishReq,
      } as never),
    ).rejects.toThrow()
    expect(savedDraft).toEqual(originalSnapshot)
    expect(publishReq.context).toEqual({})
    expect(publishReq.payload.create).not.toHaveBeenCalled()
  })

  it('rejects invalid contact structure even for a draft', async () => {
    await expect(
      prepareAssociationPageChange({
        data: {
          contacts: [contact({ type: 'unsupported' })],
          pageKey: 'contact',
        },
        operation: 'create',
        req: request({ draft: true }),
      } as never),
    ).rejects.toThrow()
  })

  it('rejects duplicate fixed identities and identity changes', async () => {
    await expect(
      prepareAssociationPageChange({
        data: { pageKey: 'about' },
        operation: 'create',
        req: request({ draft: true, existing: [{ id: 'existing' }] }),
      } as never),
    ).rejects.toThrow()

    await expect(
      prepareAssociationPageChange({
        data: { pageKey: 'contact' },
        operation: 'update',
        originalDoc: { pageKey: 'about' },
        req: request({ draft: true }),
      } as never),
    ).rejects.toThrow()
  })

  it('uses the stored document for a partial live update and requires direct publish', async () => {
    const req = request()
    const result = await prepareAssociationPageChange({
      data: {},
      operation: 'update',
      originalDoc: {
        _status: 'draft',
        body: body(),
        createdBy: 'creator-1',
        pageKey: 'contact',
        title: '联系方式',
        contacts: [contact()],
      },
      req,
    } as never)

    expect(mocks.authorize).toHaveBeenCalledWith(
      actor,
      'content.directPublish',
      { type: 'global' },
      expect.any(Date),
    )
    expect(result).toMatchObject({
      _status: 'published',
      createdBy: 'creator-1',
      pageKey: 'contact',
    })
    expect(result.publishedAt).toEqual(expect.any(String))
    expect(req.context).toMatchObject({
      associationPagePublicationAction: 'publish',
      associationPagePublicationTime: expect.any(String),
    })
  })

  it('allows a new home draft but rejects ordinary unpublish after publication', async () => {
    const originalDoc = {
      _status: 'published',
      body: body(),
      createdBy: 'creator-1',
      pageKey: 'home',
      publishedAt: '2026-07-15T00:00:00.000Z',
      title: '首页',
    }
    const draftResult = await prepareAssociationPageChange({
      data: { _status: 'draft', title: '首页新版草稿' },
      operation: 'update',
      originalDoc,
      req: request({ draft: true }),
    } as never)

    expect(draftResult.publishedAt).toBe(originalDoc.publishedAt)
    expect(mocks.authorize).not.toHaveBeenCalled()

    const unpublishReq = request()
    await expect(
      prepareAssociationPageChange({
        data: { _status: 'draft' },
        operation: 'update',
        originalDoc,
        req: unpublishReq,
      } as never),
    ).rejects.toThrow()
    expect(unpublishReq.context).toEqual({})
  })

  it('denies live writes without direct publish while still permitting drafts', async () => {
    mocks.authorize.mockReturnValue({ allowed: false })
    await expect(
      prepareAssociationPageChange({
        data: { body: body(), pageKey: 'about', title: '关于协会' },
        operation: 'create',
        req: request(),
      } as never),
    ).rejects.toThrow()

    await expect(
      prepareAssociationPageChange({
        data: { pageKey: 'about' },
        operation: 'create',
        req: request({ draft: true }),
      } as never),
    ).resolves.toMatchObject({ pageKey: 'about' })
  })
})

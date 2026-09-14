import { describe, expect, it, vi } from 'vitest'

import { getPublicAssociationPage } from '@/modules/content/association-pages/public-read'

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

function payloadWith(doc: unknown) {
  return {
    find: vi.fn().mockResolvedValue({ docs: doc ? [doc] : [] }),
  }
}

describe('public association page read', () => {
  it('uses a fixed published query and exposes only mapped public contacts', async () => {
    const payload = payloadWith({
      body: body(),
      contacts: [
        {
          contactId,
          isPublic: true,
          label: '协会邮箱',
          showOnHome: true,
          type: 'email',
          value: 'public@example.test',
        },
        {
          contactId: '44baef57-4b1a-4a59-b6a1-aa46aafdddc1',
          isPublic: false,
          label: '内部微信',
          showOnHome: false,
          type: 'wechat',
          value: 'private_wechat',
        },
      ],
      createdBy: 'must-not-leak',
      pageKey: 'contact',
      publishedAt: '2026-07-16T00:00:00.000Z',
      seoSummary: null,
      title: '联系方式',
    })

    const result = await getPublicAssociationPage(
      payload as never,
      {} as never,
      'contact',
    )

    expect(payload.find).toHaveBeenCalledWith({
      collection: 'association-pages',
      draft: false,
      limit: 1,
      overrideAccess: true,
      req: {},
      select: {
        body: true,
        contacts: true,
        lead: true,
        pageKey: true,
        seoSummary: true,
        title: true,
      },
      where: {
        and: [
          { pageKey: { equals: 'contact' } },
          { _status: { equals: 'published' } },
        ],
      },
    })
    expect(result).toMatchObject({
      contacts: [
        {
          contactId,
          href: 'mailto:public@example.test',
          value: 'public@example.test',
        },
      ],
      pageKey: 'contact',
      version: 1,
    })
    expect(JSON.stringify(result)).not.toContain('private_wechat')
    expect(JSON.stringify(result)).not.toContain('createdBy')
    expect(JSON.stringify(result)).not.toContain('publishedAt')
  })

  it('returns NOT_FOUND for an invalid identity or an unpublished page', async () => {
    const payload = payloadWith(undefined)

    await expect(
      getPublicAssociationPage(payload as never, {} as never, 'news'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(payload.find).not.toHaveBeenCalled()

    await expect(
      getPublicAssociationPage(payload as never, {} as never, 'about'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  it('fails closed when selected data has the wrong identity or invalid DTO', async () => {
    await expect(
      getPublicAssociationPage(
        payloadWith({ body: body(), pageKey: 'about', title: '错页' }) as never,
        {} as never,
        'home',
      ),
    ).rejects.toThrow('public validation')

    await expect(
      getPublicAssociationPage(
        payloadWith({ body: body(), pageKey: 'home', title: '' }) as never,
        {} as never,
        'home',
      ),
    ).rejects.toThrow('public validation')
  })
})

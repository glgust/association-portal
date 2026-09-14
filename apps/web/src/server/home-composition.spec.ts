import type {
  PublicAnnouncementPage,
  PublicAssociationContactPage,
} from '@ascnucc/contracts'
// @ts-expect-error R1 reuses the CMS Vitest runner without adding a Web dependency.
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AssociationPageNotFoundError,
  AssociationPageUnavailableError,
} from './association-page-errors'
import { getPublicContactPage } from './association-pages'
import { composeHomeSections } from './home-composition'

const body: PublicAssociationContactPage['body'] = {
  blocks: [
    {
      children: [{ marks: [], text: '虚构正文', type: 'text' }],
      type: 'paragraph',
    },
  ],
  version: 1,
}

function contactPage(count: number): PublicAssociationContactPage {
  return {
    body,
    contacts: Array.from({ length: count }, (_, index) => ({
      contactId: `00000000-0000-4000-8000-00000000000${index}`,
      href: `mailto:contact${index}@example.test`,
      label: `虚构联系 ${index}`,
      note: null,
      showOnHome: true,
      type: 'email' as const,
      value: `contact${index}@example.test`,
    })),
    pageKey: 'contact',
    seoSummary: null,
    title: '虚构联系方式',
    version: 1,
  }
}

function announcementPage(count: number): PublicAnnouncementPage {
  return {
    hasNextPage: false,
    items: Array.from({ length: count }, (_, index) => ({
      id: `10000000-0000-4000-8000-00000000000${index}`,
      publishedAt: '2026-07-16T08:00:00+08:00',
      slug: `fictional-${index}`,
      summary: null,
      title: `虚构公告 ${index}`,
    })),
    page: 1,
    pageSize: 3,
    totalItems: count,
    totalPages: count > 0 ? 1 : 0,
  }
}

function stubInvalidContactResponse() {
  vi.stubEnv('CMS_API_URL', 'http://cms.example.test')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ pageKey: 'contact', version: 1 }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    ),
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('home section composition', () => {
  it('keeps announcements ready when contacts are not published', async () => {
    const result = await composeHomeSections({
      loadAnnouncements: async () => announcementPage(1),
      loadContacts: async () => {
        throw new AssociationPageNotFoundError()
      },
    })

    expect(result.contacts).toEqual({ status: 'not-published' })
    expect(result.announcements.status).toBe('ready')
  })

  it('keeps the first three contacts ready when announcements fail', async () => {
    const result = await composeHomeSections({
      loadAnnouncements: async () => {
        throw new Error('fictional announcement failure')
      },
      loadContacts: async () => contactPage(4),
    })

    expect(result.announcements).toEqual({ status: 'unavailable' })
    expect(result.contacts.status).toBe('ready')
    if (result.contacts.status === 'ready') {
      expect(result.contacts.contacts).toHaveLength(3)
    }
  })

  it('maps an unavailable contact dependency without hiding announcement success', async () => {
    const result = await composeHomeSections({
      loadAnnouncements: async () => announcementPage(1),
      loadContacts: async () => {
        throw new AssociationPageUnavailableError('fictional-request-id')
      },
    })

    expect(result.contacts).toEqual({
      requestId: 'fictional-request-id',
      status: 'unavailable',
    })
    expect(result.announcements.status).toBe('ready')
  })

  it('distinguishes independently empty sections', async () => {
    const result = await composeHomeSections({
      loadAnnouncements: async () => announcementPage(0),
      loadContacts: async () => contactPage(0),
    })

    expect(result).toEqual({
      announcements: { status: 'empty' },
      contacts: { status: 'empty' },
    })
  })

  it('rejects an invalid CMS 200 response through the association page client schema', async () => {
    stubInvalidContactResponse()

    await expect(getPublicContactPage()).rejects.toBeInstanceOf(
      AssociationPageUnavailableError,
    )
  })

  it('keeps announcements ready when the contact client rejects an invalid DTO', async () => {
    stubInvalidContactResponse()

    const result = await composeHomeSections({
      loadAnnouncements: async () => announcementPage(1),
      loadContacts: getPublicContactPage,
    })

    expect(result.contacts).toMatchObject({ status: 'unavailable' })
    expect(result.announcements.status).toBe('ready')
  })
})

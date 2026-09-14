import type {
  PublicAssociationContact,
  PublicAssociationContactPage,
} from '@ascnucc/contracts'
import { renderToStaticMarkup } from 'react-dom/server'
// @ts-expect-error The CMS Vitest runner supplies the shared test dependency.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('next/navigation', () => ({ notFound: notFoundMock }))

import ContactPage, { generateMetadata } from './page'
import { ContactDirectory } from './ContactDirectory'

const validBody: PublicAssociationContactPage['body'] = {
  blocks: [
    {
      children: [{ text: '通讯说明正文段落。', type: 'text' }],
      type: 'paragraph',
    },
    {
      children: [{ text: '访问与到访', type: 'text' }],
      level: 2,
      type: 'heading',
    },
    {
      children: [{ text: '每一封来信都会被读完。', type: 'text' }],
      type: 'quote',
    },
  ],
  version: 1,
}

const mockContacts: PublicAssociationContact[] = [
  {
    contactId: 'c0000000-0000-4000-8000-000000000001',
    href: 'mailto:contact@example.org',
    label: '协会邮箱',
    note: '通用咨询，邮件联系',
    showOnHome: true,
    type: 'email',
    value: 'contact@example.org',
  },
  {
    contactId: 'c0000000-0000-4000-8000-000000000002',
    href: 'tel:+862085210000',
    label: '值班电话',
    note: '活动期间接听',
    showOnHome: false,
    type: 'phone',
    value: '+86 (20) 8521-0000',
  },
  {
    contactId: 'c0000000-0000-4000-8000-000000000003',
    label: '官方 QQ 群',
    note: '入群请备注',
    showOnHome: true,
    type: 'qq',
    value: '12345678',
  },
  {
    contactId: 'c0000000-0000-4000-8000-000000000004',
    label: '微信公众号',
    note: null,
    showOnHome: false,
    type: 'wechat',
    value: 'ascnu-astro',
  },
  {
    contactId: 'c0000000-0000-4000-8000-000000000005',
    label: '其他渠道',
    note: '备用联络',
    showOnHome: false,
    type: 'other',
    value: '其他自定义信息',
  },
]

function successResponse(
  overrides?: Partial<PublicAssociationContactPage>,
): Response {
  return Response.json({
    body: validBody,
    contacts: mockContacts,
    pageKey: 'contact',
    seoSummary: '示例协会公开联络目录。',
    title: '联系方式',
    version: 1,
    ...overrides,
  })
}

describe('Contact page consumers', () => {
  beforeEach(() => {
    vi.stubEnv('CMS_API_URL', 'http://127.0.0.1:3201')
    notFoundMock.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  describe('generateMetadata', () => {
    it('returns dynamic title and seoSummary from successful CMS response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          successResponse({
            seoSummary: '自定义联络摘要',
            title: '协会联络方式',
          }),
        ),
      )

      const metadata = await generateMetadata()
      expect(metadata.title).toBe('协会联络方式')
      expect(metadata.description).toBe('自定义联络摘要')
    })

    it('triggers notFound when CMS returns 404', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              code: 'NOT_FOUND',
              message: '页面尚未公开',
              requestId: 'req-404',
            }),
            {
              headers: { 'content-type': 'application/json' },
              status: 404,
            },
          ),
        ),
      )

      await expect(generateMetadata()).rejects.toThrow('NEXT_NOT_FOUND')
      expect(notFoundMock).toHaveBeenCalledTimes(1)
    })

    it('returns fallback metadata when CMS service is unavailable', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network offline')),
      )

      const metadata = await generateMetadata()
      expect(metadata.title).toBe('联系方式暂时不可用')
      expect(metadata.description).toBe('查看示例协会公开的联系方式。')
    })
  })

  describe('ContactPage rendering', () => {
    it('renders full archive layout, masthead stats, derived numbering, and channels', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successResponse()))

      const html = renderToStaticMarkup(await ContactPage())

      // Headings and Meta
      expect(html).toContain('CONTACT DIRECTORY · 联系方式')
      expect(html).toContain('CONTACT')
      expect(html).toContain('SIGNAL')
      expect(html).toContain('示例协会公开联络目录。')

      // Stats calculation: 5 contacts, 5 types, 2 showOnHome
      expect(html).toContain('05') // 登记渠道
      expect(html).toContain('02') // 首页展示

      // Derived C-01... numbering
      expect(html).toContain('C-01')
      expect(html).toContain('C-02')
      expect(html).toContain('C-03')
      expect(html).toContain('C-04')
      expect(html).toContain('C-05')

      // Type badges
      expect(html).toContain('Email')
      expect(html).toContain('Phone')
      expect(html).toContain('QQ')
      expect(html).toContain('WeChat')
      expect(html).toContain('Info')

      // Values and notes
      expect(html).toContain('contact@example.org')
      expect(html).toContain('+86 (20) 8521-0000')
      expect(html).toContain('12345678')
      expect(html).toContain('ascnu-astro')
      expect(html).toContain('其他自定义信息')
      expect(html).toContain('通用咨询，邮件联系')

      // Home tag
      expect(html).toContain('HOME')

      // Actions: email mailto:, phone tel:, qq/wechat/other copy button
      expect(html).toContain('href="mailto:contact@example.org"')
      expect(html).toContain('写信 →')
      expect(html).toContain('href="tel:+862085210000"')
      expect(html).toContain('拨打 →')
      expect(html).toContain('aria-label="复制 官方 QQ 群"')
      expect(html).toContain('aria-label="复制 微信公众号"')
      expect(html).toContain('aria-label="复制 其他渠道"')

      // Notes section with PublicRichText and Archive rail
      expect(html).toContain('NOTES · 通讯说明')
      expect(html).toContain('通讯说明正文段落。')
      expect(html).toContain('访问与到访')
      expect(html).toContain('每一封来信都会被读完。')

      // Colophon with project & association names
      expect(html).toContain('PORTAL · CONTACT DIRECTORY')
      expect(html).toContain('PORTAL · 示例协会')

      // Background canvas and ghost coordinates
      expect(html).toContain('contact-starfield')
      expect(html).toContain('23.13°N')
      expect(html).toContain('SIGNAL')
    })

    it('handles contacts empty state gracefully while preserving rich text body', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          successResponse({
            contacts: [],
          }),
        ),
      )

      const html = renderToStaticMarkup(await ContactPage())

      // Stats are 00
      expect(html).toContain('00')
      // Directory displays independent empty message
      expect(html).toContain('暂无公开联络渠道。')
      // Body notes still render
      expect(html).toContain('NOTES · 通讯说明')
      expect(html).toContain('通讯说明正文段落。')
    })

    it('omits notes section when body has no text content', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          successResponse({
            body: {
              blocks: [
                {
                  children: [{ text: '   ', type: 'text' }],
                  type: 'paragraph',
                },
              ],
              version: 1,
            },
          }),
        ),
      )

      const html = renderToStaticMarkup(await ContactPage())

      // Directory renders
      expect(html).toContain('contact@example.org')
      // Notes section is omitted
      expect(html).not.toContain('NOTES · 通讯说明')
    })

    it('renders service unavailable view with request ID on failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              code: 'INTERNAL_ERROR',
              message: '服务不可用',
              requestId: 'test-req-99999',
            }),
            {
              headers: {
                'content-type': 'application/json',
                'x-request-id': 'test-req-99999',
              },
              status: 500,
            },
          ),
        ),
      )

      const html = renderToStaticMarkup(await ContactPage())

      expect(html).toContain('联系方式暂时无法载入')
      expect(html).toContain('内容服务暂时不可用，请稍后再试。')
      expect(html).toContain('test-req-99999')
      expect(html).toContain('role="status"')
    })

    it('triggers notFound when page is not published (404)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              code: 'NOT_FOUND',
              message: '未公开',
              requestId: 'req-404',
            }),
            {
              headers: { 'content-type': 'application/json' },
              status: 404,
            },
          ),
        ),
      )

      await expect(ContactPage()).rejects.toThrow('NEXT_NOT_FOUND')
      expect(notFoundMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('ContactDirectory component', () => {
    it('renders copy button with accessible labels and live region', () => {
      const html = renderToStaticMarkup(
        <ContactDirectory contacts={mockContacts} />,
      )

      expect(html).toContain('aria-live="polite"')
      expect(html).toContain('aria-label="复制 官方 QQ 群"')
      expect(html).toContain('aria-label="复制 微信公众号"')
      expect(html).toContain('aria-label="复制 其他渠道"')
      expect(html).toContain('class="contact-act-t">复制</span>')
    })

    it('renders direct links for email and phone without copy buttons', () => {
      const html = renderToStaticMarkup(
        <ContactDirectory contacts={mockContacts} />,
      )

      expect(html).toContain('href="mailto:contact@example.org"')
      expect(html).toContain('写信 →')
      expect(html).toContain('href="tel:+862085210000"')
      expect(html).toContain('拨打 →')
    })
  })
})

import { describe, expect, it } from 'vitest'

import {
  apiErrorSchema,
  applicationSubmitSchema,
  formSchema,
  membershipAccountClaimOptionsSchema,
  membershipAccountClaimResultSchema,
  membershipAccountClaimSubmitSchema,
  membershipIntakeApplicationSubmitSchema,
  membershipIdempotencyKeySchema,
  membershipStatusQuerySchema,
  membershipStatusResultSchema,
  publicActivityDetailSchema,
  publicActivityListItemSchema,
  publicActivityPageSchema,
  publicAnnouncementDetailSchema,
  publicAnnouncementPageSchema,
  publicAssociationPageSchema,
  publicGalleryDetailSchema,
  publicGalleryPageSchema,
  publicNewsDetailSchema,
  publicNewsPageSchema,
  publicRichTextV1Schema,
} from './index'

const announcementId = 'f891a717-39b0-4752-ac1b-6e2be154cea9'
const activityId = 'dfc78e34-2a5b-4895-9e8e-b5df65c76011'
const newsId = '7b119271-8fa5-4674-8a34-853128e2ed82'
const galleryId = '5de0f5dc-74e0-4f9b-9cc7-33241fdab80f'

const galleryItem = {
  authorName: '虚构观星者',
  id: galleryId,
  image: {
    alt: '虚构星云测试图',
    height: 1200,
    variants: {
      detail: {
        height: 1200,
        path: '/api/v1/content/gallery/fictional-nebula/image/detail',
        width: 1800,
      },
      display: {
        height: 1200,
        path: '/api/v1/content/gallery/fictional-nebula/image/display',
        width: 1800,
      },
      list: {
        height: 853,
        path: '/api/v1/content/gallery/fictional-nebula/image/list',
        width: 1280,
      },
      thumbnail: {
        height: 427,
        path: '/api/v1/content/gallery/fictional-nebula/image/thumbnail',
        width: 640,
      },
    },
    width: 1800,
  },
  publishedAt: '2026-08-26T20:00:00+08:00',
  slug: 'fictional-nebula',
  summary: '仅用于自动化的虚构作品。',
  title: '虚构星云',
}

describe('public Gallery contracts', () => {
  it('accepts the strict list/detail and pagination shapes', () => {
    expect(publicGalleryDetailSchema.parse(galleryItem)).toEqual(galleryItem)
    const page = {
      hasNextPage: false,
      items: [galleryItem],
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    }
    expect(publicGalleryPageSchema.parse(page)).toEqual(page)
  })

  it.each([
    { author: galleryId },
    { createdBy: galleryId },
    { objectKey: 'media/private/display.webp' },
    { sha256: 'a'.repeat(64) },
    { status: 'published' },
    { username: 'fictional-user' },
  ])('rejects internal Gallery fields: %o', (internal) => {
    expect(
      publicGalleryDetailSchema.safeParse({ ...galleryItem, ...internal })
        .success,
    ).toBe(false)
  })

  it.each([
    'https://objects.example.test/private.webp',
    '//objects.example.test/private.webp',
    '/media/private.webp?token=secret',
    '/media/private.webp#fragment',
    '/media\\private.webp',
  ])('rejects unsafe Gallery image path %s', (path) => {
    expect(
      publicGalleryDetailSchema.safeParse({
        ...galleryItem,
        image: {
          ...galleryItem.image,
          variants: {
            ...galleryItem.image.variants,
            display: { ...galleryItem.image.variants.display, path },
          },
        },
      }).success,
    ).toBe(false)
  })

  it('rejects invalid text, dimensions, and pagination overflow', () => {
    expect(
      publicGalleryDetailSchema.safeParse({
        ...galleryItem,
        authorName: '不安全\n署名',
      }).success,
    ).toBe(false)
    for (const separator of ['\u0085', '\u2028', '\u2029']) {
      expect(
        publicGalleryDetailSchema.safeParse({
          ...galleryItem,
          title: `不安全${separator}标题`,
        }).success,
      ).toBe(false)
    }
    expect(
      publicGalleryDetailSchema.safeParse({
        ...galleryItem,
        slug: '../private-object',
      }).success,
    ).toBe(false)
    expect(
      publicGalleryDetailSchema.safeParse({
        ...galleryItem,
        image: { ...galleryItem.image, width: 16_385 },
      }).success,
    ).toBe(false)
    expect(
      publicGalleryPageSchema.safeParse({
        hasNextPage: false,
        items: [],
        page: 1,
        pageSize: 51,
        totalItems: 0,
        totalPages: 0,
      }).success,
    ).toBe(false)
  })
})

describe('membership transport identifiers', () => {
  it('accepts only a UUID idempotency key', () => {
    const key = '9f0b30b8-14c1-4b25-8b6c-d59447fd61d2'
    expect(membershipIdempotencyKeySchema.parse(key)).toBe(key)
    for (const invalid of [
      '13800138000',
      '202612345678',
      'member@example.com',
      'password123',
      'free-form-idempotency-key',
      'a'.repeat(101),
    ]) {
      expect(membershipIdempotencyKeySchema.safeParse(invalid).success).toBe(
        false,
      )
    }
  })

  it('accepts only an opaque versioned status receipt in a POST body DTO', () => {
    const receipt = `v1.${'a'.repeat(40)}.${'b'.repeat(43)}`
    expect(
      membershipStatusQuerySchema.parse({ statusReceipt: receipt }),
    ).toEqual({ statusReceipt: receipt })
    for (const invalid of [
      '202612345678',
      'member@example.com',
      'password123',
      `v1.${'a'.repeat(40)}.contains spaces`,
    ]) {
      expect(
        membershipStatusQuerySchema.safeParse({ statusReceipt: invalid })
          .success,
      ).toBe(false)
    }
  })

  it('exposes only the frozen coarse public status fields', () => {
    const value = {
      nextStep: '使用正式密码登录。',
      publicMessage: '审核已通过。',
      requestId: 'request-status',
      status: 'approvedCanLogin',
      updatedAt: '2026-08-15T00:00:00.000Z',
    }
    expect(membershipStatusResultSchema.parse(value)).toEqual(value)
    expect(
      membershipStatusResultSchema.safeParse({ ...value, authUserId: 'x' })
        .success,
    ).toBe(false)
  })
})

const validBody = {
  blocks: [
    {
      children: [
        { marks: ['bold', 'italic'], text: '欢迎加入', type: 'text' },
        { type: 'lineBreak' },
        {
          children: [{ text: '查看详情', type: 'text' }],
          href: '/announcements/details',
          type: 'link',
        },
      ],
      type: 'paragraph',
    },
    {
      children: [{ marks: ['underline'], text: '观测安排', type: 'text' }],
      level: 2,
      type: 'heading',
    },
    {
      items: [{ children: [{ marks: ['code'], text: '20:00', type: 'text' }] }],
      type: 'orderedList',
    },
    {
      items: [{ children: [{ text: '教学楼天台', type: 'text' }] }],
      type: 'unorderedList',
    },
    {
      children: [
        {
          children: [{ text: '安全须知', type: 'text' }],
          href: 'https://example.test/safety',
          type: 'link',
        },
      ],
      type: 'quote',
    },
  ],
  version: 1,
} as const

describe('public runtime contracts', () => {
  const primaryContact = {
    isPrimary: true,
    label: null,
    type: 'wechat',
    value: 'fictional_member_2026',
  } as const

  it('freezes membership claim options without personal overrides', () => {
    const result = membershipAccountClaimOptionsSchema.parse({
      options: [
        {
          defaultPermissionSummary: [],
          defaultRole: 'member',
          description: '非校内登记的正式成员',
          label: '会员',
          membershipIdentity: 'member',
        },
        {
          defaultPermissionSummary: ['查看被授权的届次申请'],
          defaultRole: 'staff',
          description: '普通干事',
          label: '普通干事',
          membershipIdentity: 'staff',
        },
        {
          defaultPermissionSummary: ['处理被授权的协会事务'],
          defaultRole: 'cadre',
          description: '部门干部',
          label: '部门干部',
          membershipIdentity: 'cadre',
        },
      ],
      requestId: 'fictional-options-request',
    })

    expect(result.options[0]).not.toHaveProperty('permissionOverrides')
  })

  it('enforces claim password, confirmation, major, and one primary contact', () => {
    const base = {
      contacts: [primaryContact],
      fullName: '虚构会员甲',
      major: '天文学 (虚构)',
      membershipIdentity: 'staff',
      password: 'Fictional-Claim-2026!',
      passwordConfirmation: 'Fictional-Claim-2026!',
      studentNumber: '202600000001',
    }
    expect(membershipAccountClaimSubmitSchema.parse(base)).toEqual(base)
    expect(
      membershipAccountClaimSubmitSchema.safeParse({
        ...base,
        contacts: [
          primaryContact,
          { ...primaryContact, type: 'qq', value: '12345678' },
        ],
      }).success,
    ).toBe(false)
    expect(
      membershipAccountClaimSubmitSchema.safeParse({
        ...base,
        passwordConfirmation: 'Different-Fictional-2026!',
      }).success,
    ).toBe(false)
    expect(
      membershipAccountClaimSubmitSchema.safeParse({ ...base, major: null })
        .success,
    ).toBe(false)
    expect(
      membershipAccountClaimSubmitSchema.safeParse({
        ...base,
        studentNumber: '2026-not-a-student-number',
      }).success,
    ).toBe(false)
  })

  it('keeps manual verification results generic and free of target ids', () => {
    const result = membershipAccountClaimResultSchema.parse({
      outcome: 'manualVerificationRequired',
      requestId: 'fictional-manual-request',
    })
    expect(result).toEqual({
      outcome: 'manualVerificationRequired',
      requestId: 'fictional-manual-request',
    })
    expect(result).not.toHaveProperty('accountClaimId')
  })

  it('rejects passwords and unknown fields from manual intake', () => {
    const result = membershipIntakeApplicationSubmitSchema.safeParse({
      contacts: [primaryContact],
      fullName: '虚构会员乙',
      major: null,
      membershipIdentity: 'member',
      password: 'must-not-cross-the-intake-boundary',
      privacyPurposeAccepted: true,
      studentNumber: null,
    })
    expect(result.success).toBe(false)
  })

  it('rejects duplicate stable field identifiers', () => {
    const parsed = formSchema.safeParse({
      fields: [
        { fieldId: 'fullName', label: '姓名', required: true, type: 'text' },
        {
          fieldId: 'fullName',
          label: '再次输入',
          required: false,
          type: 'text',
        },
      ],
      schemaVersion: 1,
    })

    expect(parsed.success).toBe(false)
  })

  it('rejects unknown submit fields at the transport boundary', () => {
    const parsed = applicationSubmitSchema.safeParse({
      answers: { fullName: '测试同学' },
      formVersionId: 'f891a717-39b0-4752-ac1b-6e2be154cea9',
      status: 'approved',
    })

    expect(parsed.success).toBe(false)
  })

  it('uses stable error codes and request ids', () => {
    expect(
      apiErrorSchema.parse({
        code: 'FORBIDDEN',
        message: 'Not allowed',
        requestId: 'request-1',
      }),
    ).toMatchObject({ code: 'FORBIDDEN', requestId: 'request-1' })
  })

  it('accepts every frozen public rich-text node and mark', () => {
    expect(publicRichTextV1Schema.parse(validBody)).toEqual(validBody)
  })

  it.each([
    '/announcements/inside',
    './inside',
    '../inside',
    '#section',
    '?page=2',
    'https://example.test/path',
    'http://example.test/path',
    'mailto:contact@example.test',
  ])('accepts the frozen link destination %s', (href) => {
    expect(
      publicRichTextV1Schema.safeParse({
        blocks: [
          {
            children: [
              {
                children: [{ text: 'link', type: 'text' }],
                href,
                type: 'link',
              },
            ],
            type: 'paragraph',
          },
        ],
        version: 1,
      }).success,
    ).toBe(true)
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,bad',
    '//example.test',
    '/\\evil.example/path',
    ' https://example.test',
  ])('rejects the unsafe link destination %s', (href) => {
    expect(
      publicRichTextV1Schema.safeParse({
        blocks: [
          {
            children: [
              {
                children: [{ text: 'link', type: 'text' }],
                href,
                type: 'link',
              },
            ],
            type: 'paragraph',
          },
        ],
        version: 1,
      }).success,
    ).toBe(false)
  })

  it('rejects unknown rich-text nodes, fields and duplicate marks', () => {
    expect(
      publicRichTextV1Schema.safeParse({ blocks: [], version: 1 }).success,
    ).toBe(false)
    expect(
      publicRichTextV1Schema.safeParse({
        blocks: [{ html: '<script />', type: 'html' }],
        version: 1,
      }).success,
    ).toBe(false)
    expect(
      publicRichTextV1Schema.safeParse({
        blocks: [
          {
            children: [{ text: 'unsafe', type: 'text', url: 'payload-field' }],
            type: 'paragraph',
          },
        ],
        version: 1,
      }).success,
    ).toBe(false)
    expect(
      publicRichTextV1Schema.safeParse({
        blocks: [
          {
            children: [
              { marks: ['bold', 'bold'], text: 'duplicate', type: 'text' },
            ],
            type: 'paragraph',
          },
        ],
        version: 1,
      }).success,
    ).toBe(false)
  })

  it('accepts zoned publication times and rejects timestamps without a zone', () => {
    const detail = {
      body: validBody,
      id: announcementId,
      publishedAt: '2026-07-14T08:30:00+08:00',
      slug: 'announcement-ab12cd',
      summary: null,
      title: '公告标题',
    }
    expect(publicAnnouncementDetailSchema.parse(detail)).toEqual(detail)
    expect(
      publicAnnouncementDetailSchema.safeParse({
        ...detail,
        publishedAt: '2026-07-14T08:30:00',
      }).success,
    ).toBe(false)
  })

  it('rejects Payload and Lexical implementation fields', () => {
    const detail = {
      body: validBody,
      id: announcementId,
      publishedAt: '2026-07-14T00:30:00.000Z',
      slug: 'announcement-ab12cd',
      summary: '公开摘要',
      title: '公告标题',
    }
    expect(
      publicAnnouncementDetailSchema.safeParse({
        ...detail,
        _status: 'published',
      }).success,
    ).toBe(false)
    expect(
      publicAnnouncementDetailSchema.safeParse({
        ...detail,
        body: { ...validBody, root: { type: 'root' } },
      }).success,
    ).toBe(false)
  })

  it('enforces announcement pagination boundaries and strict fields', () => {
    const page = {
      hasNextPage: false,
      items: [],
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
    }
    expect(publicAnnouncementPageSchema.parse(page)).toEqual(page)
    expect(
      publicAnnouncementPageSchema.safeParse({ ...page, page: 0 }).success,
    ).toBe(false)
    expect(
      publicAnnouncementPageSchema.safeParse({ ...page, pageSize: 51 }).success,
    ).toBe(false)
    expect(
      publicAnnouncementPageSchema.safeParse({ ...page, totalItems: -1 })
        .success,
    ).toBe(false)
    expect(
      publicAnnouncementPageSchema.safeParse({ ...page, docs: [] }).success,
    ).toBe(false)
  })

  it('accepts strict News list/detail DTOs with zoned publication time', () => {
    const item = {
      id: newsId,
      publishedAt: '2026-07-19T10:30:00+08:00',
      slug: 'news-7b119271',
      summary: '虚构新闻摘要',
      title: '虚构新闻标题',
    }
    expect(publicNewsDetailSchema.parse({ ...item, body: validBody })).toEqual({
      ...item,
      body: validBody,
    })
    expect(
      publicNewsDetailSchema.safeParse({
        ...item,
        body: validBody,
        publishedAt: '2026-07-19T10:30:00',
      }).success,
    ).toBe(false)
  })

  it.each([
    { title: ' 新闻标题' },
    { title: '新闻\n标题' },
    { title: 'Ａ'.repeat(121) },
    { summary: '' },
    { summary: '摘要\r内容' },
    { summary: '摘要\u0000内容' },
  ])('rejects invalid normalized News text: %o', (change) => {
    expect(
      publicNewsDetailSchema.safeParse({
        body: validBody,
        id: newsId,
        publishedAt: '2026-07-19T02:30:00.000Z',
        slug: 'news-7b119271',
        summary: null,
        title: '虚构新闻标题',
        ...change,
      }).success,
    ).toBe(false)
  })

  it('rejects News internal fields, Lexical structure, and pagination overflow', () => {
    const page = {
      hasNextPage: false,
      items: [],
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
    }
    expect(publicNewsPageSchema.parse(page)).toEqual(page)
    expect(publicNewsPageSchema.safeParse({ ...page, page: 0 }).success).toBe(
      false,
    )
    expect(
      publicNewsPageSchema.safeParse({
        ...page,
        page: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false)
    expect(
      publicNewsPageSchema.safeParse({ ...page, pageSize: 51 }).success,
    ).toBe(false)
    expect(
      publicNewsDetailSchema.safeParse({
        _status: 'published',
        body: { ...validBody, root: { type: 'root' } },
        createdBy: newsId,
        id: newsId,
        publishedAt: '2026-07-19T02:30:00.000Z',
        slug: 'news-7b119271',
        summary: null,
        title: '虚构新闻标题',
      }).success,
    ).toBe(false)
  })

  it.each([
    ['upcoming', '2026-07-20T11:00:00+08:00', null],
    ['ongoing', '2026-07-20T12:00:00+08:00', null],
    ['ended', '2026-07-20T14:00:00+08:00', null],
    ['cancelled', '2026-07-20T11:00:00+08:00', '因天气原因取消。'],
  ])(
    'accepts a strict temporary activity in %s state',
    (status, _asOf, cancellationNote) => {
      const activity = {
        activityType: 'temporary',
        cancellationNote,
        endsAt: '2026-07-20T14:00:00+08:00',
        id: activityId,
        location: '虚构校园北广场',
        publishedAt: '2026-07-16T09:00:00+08:00',
        slug: 'summer-observation-a1b2c3d4',
        startsAt: '2026-07-20T12:00:00+08:00',
        status,
        summary: '一场纯虚构的夏季观测活动。',
        title: '夏季观测夜',
        version: 1,
      }
      expect(publicActivityListItemSchema.parse(activity)).toEqual(activity)
      expect(
        publicActivityDetailSchema.parse({ ...activity, body: validBody }),
      ).toEqual({ ...activity, body: validBody })
    },
  )

  it.each([
    ['ongoing', null],
    ['cancelled', '活动安排已取消。'],
  ])('accepts a strict standing activity in %s state', (status, note) => {
    const activity = {
      activityType: 'standing',
      cancellationNote: note,
      id: activityId,
      location: '虚构社团活动室',
      publishedAt: '2026-07-16T09:00:00+08:00',
      scheduleText: '每周五 19:30–21:00',
      slug: 'weekly-meetup-a1b2c3d4',
      status,
      summary: null,
      title: '每周星空会',
      version: 1,
    }
    expect(publicActivityListItemSchema.parse(activity)).toEqual(activity)
  })

  it('preserves canonical LF multiline activity text', () => {
    const activity = {
      activityType: 'standing',
      cancellationNote: '取消第一行\n取消第二行',
      id: activityId,
      location: '虚构社团活动室',
      publishedAt: '2026-07-16T09:00:00+08:00',
      scheduleText: '周五\n周六',
      slug: 'multiline-activity-a1b2c3d4',
      status: 'cancelled',
      summary: '摘要第一行\n摘要第二行',
      title: '多行说明活动',
      version: 1,
    }
    expect(publicActivityListItemSchema.parse(activity)).toEqual(activity)
  })

  it.each(['\r', '\t', '\u000b', '\u000c', '\u001f', '\u007f'])(
    'rejects non-canonical activity multiline control character %s',
    (control) => {
      const activity = {
        activityType: 'standing',
        cancellationNote: null,
        id: activityId,
        location: '虚构社团活动室',
        publishedAt: '2026-07-16T09:00:00+08:00',
        scheduleText: `周五${control}周六`,
        slug: 'invalid-multiline-activity-a1b2c3d4',
        status: 'ongoing',
        summary: null,
        title: '非法多行说明活动',
        version: 1,
      }
      expect(publicActivityListItemSchema.safeParse(activity).success).toBe(
        false,
      )
    },
  )

  it.each(['title', 'location'] as const)(
    'rejects line breaks in single-line activity %s',
    (field) => {
      const activity = {
        activityType: 'standing',
        cancellationNote: null,
        id: activityId,
        location: '虚构社团活动室',
        publishedAt: '2026-07-16T09:00:00+08:00',
        scheduleText: '每周五',
        slug: 'invalid-single-line-activity-a1b2c3d4',
        status: 'ongoing',
        summary: null,
        title: '非法单行活动',
        version: 1,
        [field]: '第一行\n第二行',
      }
      expect(publicActivityListItemSchema.safeParse(activity).success).toBe(
        false,
      )
      expect(
        publicActivityListItemSchema.safeParse({
          ...activity,
          [field]: ' 首尾空白 ',
        }).success,
      ).toBe(false)
    },
  )

  it.each([
    {
      activityType: 'invalid',
      cancellationNote: null,
      scheduleText: '每周五',
      status: 'ongoing',
    },
    {
      activityType: 'standing',
      cancellationNote: null,
      endsAt: '2026-07-20T14:00:00+08:00',
      scheduleText: '每周五',
      startsAt: '2026-07-20T12:00:00+08:00',
      status: 'ongoing',
    },
    {
      activityType: 'standing',
      cancellationNote: null,
      scheduleText: '每周五',
      status: 'ended',
    },
    {
      activityType: 'temporary',
      cancellationNote: null,
      endsAt: '2026-07-20T14:00:00+08:00',
      startsAt: '2026-07-20T12:00:00+08:00',
      status: 'cancelled',
    },
    {
      activityType: 'temporary',
      cancellationNote: '未取消时不得公开说明',
      endsAt: '2026-07-20T14:00:00+08:00',
      startsAt: '2026-07-20T12:00:00+08:00',
      status: 'upcoming',
    },
  ])('rejects an invalid activity discriminant combination', (variant) => {
    expect(
      publicActivityListItemSchema.safeParse({
        id: activityId,
        location: '虚构地点',
        publishedAt: '2026-07-16T09:00:00+08:00',
        slug: 'invalid-activity-a1b2c3d4',
        summary: null,
        title: '非法活动样例',
        version: 1,
        ...variant,
      }).success,
    ).toBe(false)
  })

  it('rejects leaked Payload, Lexical and cancellation-control fields', () => {
    const activity = {
      activityType: 'temporary',
      cancellationNote: null,
      endsAt: '2026-07-20T14:00:00+08:00',
      id: activityId,
      location: '虚构地点',
      publishedAt: '2026-07-16T09:00:00+08:00',
      slug: 'strict-activity-a1b2c3d4',
      startsAt: '2026-07-20T12:00:00+08:00',
      status: 'upcoming',
      summary: null,
      title: '严格活动样例',
      version: 1,
    }
    for (const leaked of [
      { _status: 'published' },
      { isCancelled: false },
      { createdBy: announcementId },
      { lastEditedBy: announcementId },
    ]) {
      expect(
        publicActivityListItemSchema.safeParse({ ...activity, ...leaked })
          .success,
      ).toBe(false)
    }
    expect(
      publicActivityDetailSchema.safeParse({
        ...activity,
        body: { ...validBody, root: { type: 'root' } },
      }).success,
    ).toBe(false)
  })

  it.each([
    ['2026-07-20T14:00:00+08:00', '2026-07-20T14:00:00+08:00'],
    ['2026-07-20T15:00:00+08:00', '2026-07-20T14:00:00+08:00'],
  ])(
    'rejects non-ascending temporary activity times (%s → %s)',
    (startsAt, endsAt) => {
      const activity = {
        activityType: 'temporary',
        cancellationNote: null,
        endsAt,
        id: activityId,
        location: '虚构地点',
        publishedAt: '2026-07-16T09:00:00+08:00',
        slug: 'invalid-time-activity-a1b2c3d4',
        startsAt,
        status: 'ended',
        summary: null,
        title: '非法时间活动样例',
        version: 1,
      }
      expect(publicActivityListItemSchema.safeParse(activity).success).toBe(
        false,
      )
      expect(
        publicActivityDetailSchema.safeParse({
          ...activity,
          body: validBody,
        }).success,
      ).toBe(false)
    },
  )

  it('enforces activity pagination and asOf boundaries', () => {
    const page = {
      asOf: '2026-07-20T12:00:00+08:00',
      hasNextPage: false,
      items: [],
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
    }
    expect(publicActivityPageSchema.parse(page)).toEqual(page)
    expect(
      publicActivityPageSchema.safeParse({ ...page, asOf: '2026-07-20' })
        .success,
    ).toBe(false)
    expect(
      publicActivityPageSchema.safeParse({ ...page, page: 0 }).success,
    ).toBe(false)
    expect(
      publicActivityPageSchema.safeParse({ ...page, pageSize: 51 }).success,
    ).toBe(false)
    expect(
      publicActivityPageSchema.safeParse({ ...page, docs: [] }).success,
    ).toBe(false)
  })

  it('accepts strict discriminated association pages and public contacts', () => {
    const page = {
      body: validBody,
      contacts: [
        {
          contactId: announcementId,
          href: 'mailto:public@example.test',
          label: '协会邮箱',
          note: null,
          showOnHome: true,
          type: 'email',
          value: 'public@example.test',
        },
        {
          contactId: '44baef57-4b1a-4a59-b6a1-aa46aafdddc1',
          label: '值班电话',
          note: '工作日使用',
          showOnHome: false,
          type: 'phone',
          value: '+86 (20) 1234-5678',
          href: 'tel:+862012345678',
        },
        {
          contactId: 'b34462c8-b6ea-40f7-a329-9a4923aaf2e7',
          label: '协会 QQ',
          note: null,
          showOnHome: true,
          type: 'qq',
          value: '1234567',
        },
      ],
      pageKey: 'contact',
      seoSummary: '联系协会的公开渠道。',
      title: '联系方式',
      version: 1,
    } as const

    expect(publicAssociationPageSchema.parse(page)).toEqual(page)
  })

  it('rejects leaked fields and unsafe contact link derivation', () => {
    const base = {
      body: validBody,
      lead: null,
      pageKey: 'home',
      seoSummary: null,
      title: '首页',
      version: 1,
    }
    expect(
      publicAssociationPageSchema.safeParse({
        ...base,
        _status: 'published',
      }).success,
    ).toBe(false)

    expect(
      publicAssociationPageSchema.safeParse({
        ...base,
        contacts: [],
      }).success,
    ).toBe(false)

    expect(
      publicAssociationPageSchema.safeParse({
        body: validBody,
        contacts: [
          {
            contactId: announcementId,
            href: 'mailto:other@example.test',
            label: '协会邮箱',
            note: null,
            showOnHome: true,
            type: 'email',
            value: 'public@example.test',
          },
        ],
        pageKey: 'contact',
        seoSummary: null,
        title: '联系方式',
        version: 1,
      }).success,
    ).toBe(false)
  })

  it.each([
    {
      href: 'mailto:public@example.test?subject=hello',
      type: 'email',
      value: 'public@example.test',
    },
    {
      href: 'tel:+862012345679',
      type: 'phone',
      value: '+86 (20) 1234-5678',
    },
    {
      href: 'https://example.test/qq',
      type: 'qq',
      value: '1234567',
    },
  ])('rejects mismatched or forbidden public contact hrefs', (contact) => {
    expect(
      publicAssociationPageSchema.safeParse({
        body: validBody,
        contacts: [
          {
            contactId: announcementId,
            label: '协会联系方式',
            note: null,
            showOnHome: true,
            ...contact,
          },
        ],
        pageKey: 'contact',
        seoSummary: null,
        title: '联系方式',
        version: 1,
      }).success,
    ).toBe(false)
  })

  it.each([
    { type: 'email', value: 'Name <public@example.test>' },
    { type: 'email', value: 'a@example.test,b@example.test' },
    { type: 'phone', value: '1234' },
    { type: 'phone', value: '+86+2012345678' },
    { type: 'qq', value: '１２３４５' },
    { type: 'wechat', value: '含中文微信号' },
    { type: 'other', value: '包含\u0007控制字符' },
  ])('rejects invalid public contact value $type', ({ type, value }) => {
    const href =
      type === 'email'
        ? `mailto:${value}`
        : type === 'phone'
          ? `tel:${value}`
          : undefined
    expect(
      publicAssociationPageSchema.safeParse({
        body: validBody,
        contacts: [
          {
            contactId: announcementId,
            ...(href ? { href } : {}),
            label: '协会联系方式',
            note: null,
            showOnHome: false,
            type,
            value,
          },
        ],
        pageKey: 'contact',
        seoSummary: null,
        title: '联系方式',
        version: 1,
      }).success,
    ).toBe(false)
  })
})

// Current form fields are text, textarea and single-select; arrays are unsupported.
it('rejects array answers at the application contract boundary', () => {
  expect(
    applicationSubmitSchema.safeParse({
      formVersionId: '11111111-1111-4111-8111-111111111111',
      answers: { interests: ['observing'] },
    }).success,
  ).toBe(false)
})

import { z } from 'zod'

import { formSchema } from './form-schema'

const publicRichTextMarkSchema = z.enum(['bold', 'italic', 'underline', 'code'])

const publicRichTextMarksSchema = z
  .array(publicRichTextMarkSchema)
  .max(4)
  .refine((marks) => new Set(marks).size === marks.length, {
    message: 'Text marks must be unique',
  })

const publicLinkBaseUrl = new URL('https://public-link.invalid/')

function isSupportedPublicLink(href: string): boolean {
  if (href !== href.trim() || /[\\\u0000-\u001f\u007f]/.test(href)) {
    return false
  }

  if (/^(?:\/(?!\/)|\.\/|\.\.\/|#|\?)/.test(href)) {
    try {
      return (
        new URL(href, publicLinkBaseUrl).origin === publicLinkBaseUrl.origin
      )
    } catch {
      return false
    }
  }

  try {
    const url = new URL(href)
    return ['https:', 'http:', 'mailto:'].includes(url.protocol)
  } catch {
    return false
  }
}

const publicLinkHrefSchema = z
  .string()
  .min(1)
  .refine(isSupportedPublicLink, { message: 'Unsupported link destination' })

const publicRichTextTextSchema = z
  .object({
    marks: publicRichTextMarksSchema.optional(),
    text: z.string(),
    type: z.literal('text'),
  })
  .strict()

const publicRichTextLineBreakSchema = z
  .object({ type: z.literal('lineBreak') })
  .strict()

const publicRichTextLinkChildSchema = z.discriminatedUnion('type', [
  publicRichTextTextSchema,
  publicRichTextLineBreakSchema,
])

const publicRichTextLinkSchema = z
  .object({
    children: z.array(publicRichTextLinkChildSchema).min(1),
    href: publicLinkHrefSchema,
    type: z.literal('link'),
  })
  .strict()

const publicRichTextInlineSchema = z.discriminatedUnion('type', [
  publicRichTextTextSchema,
  publicRichTextLinkSchema,
  publicRichTextLineBreakSchema,
])

const publicRichTextChildrenSchema = z.array(publicRichTextInlineSchema).min(1)

const publicRichTextListItemSchema = z
  .object({ children: publicRichTextChildrenSchema })
  .strict()

const publicRichTextBlockSchema = z.discriminatedUnion('type', [
  z
    .object({
      children: publicRichTextChildrenSchema,
      type: z.literal('paragraph'),
    })
    .strict(),
  z
    .object({
      children: publicRichTextChildrenSchema,
      level: z.union([z.literal(2), z.literal(3)]),
      type: z.literal('heading'),
    })
    .strict(),
  z
    .object({
      items: z.array(publicRichTextListItemSchema).min(1),
      type: z.literal('orderedList'),
    })
    .strict(),
  z
    .object({
      items: z.array(publicRichTextListItemSchema).min(1),
      type: z.literal('unorderedList'),
    })
    .strict(),
  z
    .object({
      children: publicRichTextChildrenSchema,
      type: z.literal('quote'),
    })
    .strict(),
])

export const publicRichTextV1Schema = z
  .object({
    blocks: z.array(publicRichTextBlockSchema).min(1),
    version: z.literal(1),
  })
  .strict()

const zonedDateTimeSchema = z.iso.datetime({ offset: true })

export const publicAnnouncementListItemSchema = z
  .object({
    id: z.string().uuid(),
    publishedAt: zonedDateTimeSchema,
    slug: z.string().min(1),
    summary: z.string().max(240).nullable(),
    title: z.string().min(1).max(120),
  })
  .strict()

export const publicAnnouncementDetailSchema = z
  .object({
    ...publicAnnouncementListItemSchema.shape,
    body: publicRichTextV1Schema,
  })
  .strict()

export const publicAnnouncementPageSchema = z
  .object({
    hasNextPage: z.boolean(),
    items: z.array(publicAnnouncementListItemSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(50),
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })
  .strict()

const publicNewsSingleLineTextSchema = z
  .string()
  .refine(
    (value) =>
      value === value.normalize('NFKC').trim() &&
      !/[\u0000-\u001f\u007f]/.test(value),
    { message: 'News text must be normalized, trimmed, and single-line' },
  )

export const publicNewsListItemSchema = z
  .object({
    id: z.string().uuid(),
    publishedAt: zonedDateTimeSchema,
    slug: z.string().min(1),
    summary: publicNewsSingleLineTextSchema.min(1).max(240).nullable(),
    title: publicNewsSingleLineTextSchema.min(1).max(120),
  })
  .strict()

export const publicNewsDetailSchema = z
  .object({
    ...publicNewsListItemSchema.shape,
    body: publicRichTextV1Schema,
  })
  .strict()

export const publicNewsPageSchema = z
  .object({
    hasNextPage: z.boolean(),
    items: z.array(publicNewsListItemSchema),
    page: z.number().int().positive().safe(),
    pageSize: z.number().int().min(1).max(50),
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })
  .strict()

export const publicGalleryImageVariantSchema = z.enum([
  'display',
  'detail',
  'list',
  'thumbnail',
])

const publicGalleryTextSchema = z
  .string()
  .refine(
    (value) =>
      value === value.normalize('NFKC').trim() &&
      !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value),
    { message: 'Gallery text must be normalized, trimmed, and single-line' },
  )

const publicGalleryImagePathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (path) =>
      path.startsWith('/') &&
      !path.startsWith('//') &&
      !/[\\?#\u0000-\u001f\u007f]/.test(path) &&
      !/^[a-z][a-z\d+.-]*:/i.test(path),
    { message: 'Gallery image path must be a safe site-relative path' },
  )

const publicGallerySlugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const publicGalleryImageVariantDescriptorSchema = z
  .object({
    height: z.number().int().positive().max(16_384),
    path: publicGalleryImagePathSchema,
    width: z.number().int().positive().max(16_384),
  })
  .strict()

export const publicGalleryImageSchema = z
  .object({
    alt: publicGalleryTextSchema.min(1).max(240),
    height: z.number().int().positive().max(16_384),
    variants: z
      .object({
        detail: publicGalleryImageVariantDescriptorSchema,
        display: publicGalleryImageVariantDescriptorSchema,
        list: publicGalleryImageVariantDescriptorSchema,
        thumbnail: publicGalleryImageVariantDescriptorSchema,
      })
      .strict(),
    width: z.number().int().positive().max(16_384),
  })
  .strict()

export const publicGalleryListItemSchema = z
  .object({
    authorName: publicGalleryTextSchema.min(1).max(100),
    id: z.string().uuid(),
    image: publicGalleryImageSchema,
    publishedAt: zonedDateTimeSchema,
    slug: publicGallerySlugSchema,
    summary: publicGalleryTextSchema.min(1).max(240).nullable(),
    title: publicGalleryTextSchema.min(1).max(120),
  })
  .strict()

export const publicGalleryDetailSchema = publicGalleryListItemSchema

export const publicGalleryPageSchema = z
  .object({
    hasNextPage: z.boolean(),
    items: z.array(publicGalleryListItemSchema),
    page: z.number().int().positive().safe(),
    pageSize: z.number().int().min(1).max(50),
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })
  .strict()

export const publicActivityTypeSchema = z.enum(['temporary', 'standing'])
export const publicActivityStatusSchema = z.enum([
  'upcoming',
  'ongoing',
  'ended',
  'cancelled',
])

const publicActivitySingleLineTextSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value),
    {
      message:
        'Public activity single-line text must be trimmed and exclude control characters',
    },
  )

const publicActivityMultilineTextSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value === value.trim() &&
      !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(value) &&
      !value.includes('\r'),
    {
      message:
        'Public activity multiline text must use LF and exclude other control characters',
    },
  )

const publicActivityCommonShape = {
  cancellationNote: z.null(),
  id: z.string().uuid(),
  location: publicActivitySingleLineTextSchema.max(200),
  publishedAt: zonedDateTimeSchema,
  slug: z.string().min(1).max(96),
  summary: publicActivityMultilineTextSchema.max(240).nullable(),
  title: publicActivitySingleLineTextSchema.max(120),
  version: z.literal(1),
}

const publicTemporaryActivityBaseShape = {
  ...publicActivityCommonShape,
  activityType: z.literal('temporary'),
  endsAt: zonedDateTimeSchema,
  startsAt: zonedDateTimeSchema,
}

const publicStandingActivityBaseShape = {
  ...publicActivityCommonShape,
  activityType: z.literal('standing'),
  scheduleText: publicActivityMultilineTextSchema.max(240),
}

function hasAscendingActivityTimes(value: {
  endsAt: string
  startsAt: string
}): boolean {
  return Date.parse(value.startsAt) < Date.parse(value.endsAt)
}

const ascendingActivityTimesIssue = {
  message: 'Activity end time must be later than its start time',
  path: ['endsAt'],
}

const publicTemporaryActivityListItemSchema = z.union([
  z
    .object({
      ...publicTemporaryActivityBaseShape,
      status: z.enum(['upcoming', 'ongoing', 'ended']),
    })
    .strict()
    .refine(hasAscendingActivityTimes, ascendingActivityTimesIssue),
  z
    .object({
      ...publicTemporaryActivityBaseShape,
      cancellationNote: publicActivityMultilineTextSchema.max(500),
      status: z.literal('cancelled'),
    })
    .strict()
    .refine(hasAscendingActivityTimes, ascendingActivityTimesIssue),
])

const publicStandingActivityListItemSchema = z.union([
  z
    .object({
      ...publicStandingActivityBaseShape,
      status: z.literal('ongoing'),
    })
    .strict(),
  z
    .object({
      ...publicStandingActivityBaseShape,
      cancellationNote: publicActivityMultilineTextSchema.max(500),
      status: z.literal('cancelled'),
    })
    .strict(),
])

export const publicActivityListItemSchema = z.union([
  publicTemporaryActivityListItemSchema,
  publicStandingActivityListItemSchema,
])

const publicTemporaryActivityDetailSchema = z.union([
  z
    .object({
      ...publicTemporaryActivityBaseShape,
      body: publicRichTextV1Schema,
      status: z.enum(['upcoming', 'ongoing', 'ended']),
    })
    .strict()
    .refine(hasAscendingActivityTimes, ascendingActivityTimesIssue),
  z
    .object({
      ...publicTemporaryActivityBaseShape,
      body: publicRichTextV1Schema,
      cancellationNote: publicActivityMultilineTextSchema.max(500),
      status: z.literal('cancelled'),
    })
    .strict()
    .refine(hasAscendingActivityTimes, ascendingActivityTimesIssue),
])

const publicStandingActivityDetailSchema = z.union([
  z
    .object({
      ...publicStandingActivityBaseShape,
      body: publicRichTextV1Schema,
      status: z.literal('ongoing'),
    })
    .strict(),
  z
    .object({
      ...publicStandingActivityBaseShape,
      body: publicRichTextV1Schema,
      cancellationNote: publicActivityMultilineTextSchema.max(500),
      status: z.literal('cancelled'),
    })
    .strict(),
])

export const publicActivityDetailSchema = z.union([
  publicTemporaryActivityDetailSchema,
  publicStandingActivityDetailSchema,
])

export const publicActivityPageSchema = z
  .object({
    asOf: zonedDateTimeSchema,
    hasNextPage: z.boolean(),
    items: z.array(publicActivityListItemSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(50),
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })
  .strict()

const publicContactBaseSchema = {
  contactId: z.uuid(),
  label: z.string().trim().min(1).max(60),
  note: z.string().trim().max(160).nullable(),
  showOnHome: z.boolean(),
}

function normalizePublicPhone(value: string): string {
  return value.replace(/[ ()-]/g, '')
}

const publicContactEmailSchema = z
  .object({
    ...publicContactBaseSchema,
    href: z.string(),
    type: z.literal('email'),
    value: z.string().trim().min(1).max(200),
  })
  .strict()
  .superRefine((contact, context) => {
    if (
      /[\u0000-\u001f\u007f,;?#/\\]/.test(contact.value) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.value)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Invalid public email value',
        path: ['value'],
      })
    }
    if (contact.href !== `mailto:${contact.value}`) {
      context.addIssue({
        code: 'custom',
        message: 'Email href must match value',
        path: ['href'],
      })
    }
  })

const publicContactPhoneSchema = z
  .object({
    ...publicContactBaseSchema,
    href: z.string(),
    type: z.literal('phone'),
    value: z.string().trim().min(1).max(200),
  })
  .strict()
  .superRefine((contact, context) => {
    const normalized = normalizePublicPhone(contact.value)
    if (
      /[\u0000-\u001f\u007f]/.test(contact.value) ||
      !/^\+?[0-9 ()-]+$/.test(contact.value) ||
      !/^\+?[0-9]{5,20}$/.test(normalized)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Invalid public phone value',
        path: ['value'],
      })
    }
    if (contact.href !== `tel:${normalized}`) {
      context.addIssue({
        code: 'custom',
        message: 'Phone href must match value',
        path: ['href'],
      })
    }
  })

const publicContactQqSchema = z
  .object({
    ...publicContactBaseSchema,
    type: z.literal('qq'),
    value: z.string().regex(/^\d{5,12}$/),
  })
  .strict()

const publicContactWechatSchema = z
  .object({
    ...publicContactBaseSchema,
    type: z.literal('wechat'),
    value: z.string().regex(/^[A-Za-z0-9_.-]{5,32}$/),
  })
  .strict()

const publicContactOtherSchema = z
  .object({
    ...publicContactBaseSchema,
    type: z.literal('other'),
    value: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
        message: 'Public contact value must not include control characters',
      }),
  })
  .strict()

export const publicAssociationContactSchema = z.discriminatedUnion('type', [
  publicContactEmailSchema,
  publicContactPhoneSchema,
  publicContactQqSchema,
  publicContactWechatSchema,
  publicContactOtherSchema,
])

const publicAssociationPageBaseSchema = {
  body: publicRichTextV1Schema,
  seoSummary: z.string().trim().max(240).nullable(),
  title: z.string().trim().min(1).max(120),
  version: z.literal(1),
}

export const publicAssociationHomePageSchema = z
  .object({
    ...publicAssociationPageBaseSchema,
    lead: z.string().trim().max(240).nullable(),
    pageKey: z.literal('home'),
  })
  .strict()

export const publicAssociationAboutPageSchema = z
  .object({
    ...publicAssociationPageBaseSchema,
    pageKey: z.literal('about'),
  })
  .strict()

export const publicAssociationContactPageSchema = z
  .object({
    ...publicAssociationPageBaseSchema,
    contacts: z.array(publicAssociationContactSchema),
    pageKey: z.literal('contact'),
  })
  .strict()

export const publicAssociationPageSchema = z.discriminatedUnion('pageKey', [
  publicAssociationHomePageSchema,
  publicAssociationAboutPageSchema,
  publicAssociationContactPageSchema,
])

export const apiErrorCodes = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const

export const apiErrorSchema = z
  .object({
    code: z.enum(apiErrorCodes),
    details: z.record(z.string(), z.unknown()).optional(),
    message: z.string(),
    requestId: z.string().min(1),
  })
  .strict()

export const membershipIdentitySchema = z.enum(['member', 'staff', 'cadre'])

export const membershipIdempotencyKeySchema = z
  .string()
  .uuid('Idempotency-Key must be a UUID')

const membershipSingleLineTextSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value === value.normalize('NFKC').trim() &&
      !/[\u0000-\u001f\u007f]/.test(value),
    {
      message:
        'Text must be normalized, trimmed, and exclude control characters',
    },
  )

const membershipNullableSingleLineTextSchema = z.union([
  membershipSingleLineTextSchema,
  z.null(),
])

export const membershipContactSchema = z
  .object({
    isPrimary: z.boolean(),
    label: membershipNullableSingleLineTextSchema,
    type: z.enum(['phone', 'wechat', 'qq', 'other']),
    value: membershipSingleLineTextSchema.max(100),
  })
  .strict()
  .superRefine((contact, context) => {
    if (contact.type === 'other') {
      if (contact.label === null || contact.label.length > 30) {
        context.addIssue({
          code: 'custom',
          message: 'Other contacts require a label of at most 30 characters',
          path: ['label'],
        })
      }
      return
    }

    if (contact.label !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Only other contacts may include a label',
        path: ['label'],
      })
    }
  })

export const membershipContactsSchema = z
  .array(membershipContactSchema)
  .min(1)
  .max(8)
  .superRefine((contacts, context) => {
    if (contacts.filter((contact) => contact.isPrimary).length !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'Exactly one contact must be primary',
        path: [],
      })
    }
  })

const membershipFullNameSchema = membershipSingleLineTextSchema.max(80)
const membershipStudentNumberSchema = membershipSingleLineTextSchema
  .min(6)
  .max(32)
  .regex(/^[0-9]+$/, 'Student number must contain ASCII digits only')
const membershipMajorSchema = membershipNullableSingleLineTextSchema.refine(
  (value) => value === null || value.length <= 100,
  { message: 'Major must contain at most 100 characters' },
)

export const membershipPasswordSchema = z.string().refine(
  (value) => {
    const codePointLength = Array.from(value).length
    return codePointLength >= 12 && codePointLength <= 128
  },
  { message: 'Password must contain 12 to 128 Unicode code points' },
)

const membershipIdentityOptionBaseShape = {
  defaultPermissionSummary: z
    .array(membershipSingleLineTextSchema.max(80))
    .max(20),
  description: membershipSingleLineTextSchema.max(240),
  label: membershipSingleLineTextSchema.max(30),
}

export const membershipIdentityOptionSchema = z.discriminatedUnion(
  'membershipIdentity',
  [
    z
      .object({
        ...membershipIdentityOptionBaseShape,
        defaultPermissionSummary: z.array(z.never()).length(0),
        defaultRole: z.literal('member'),
        membershipIdentity: z.literal('member'),
      })
      .strict(),
    z
      .object({
        ...membershipIdentityOptionBaseShape,
        defaultRole: z.literal('staff'),
        membershipIdentity: z.literal('staff'),
      })
      .strict(),
    z
      .object({
        ...membershipIdentityOptionBaseShape,
        defaultRole: z.literal('cadre'),
        membershipIdentity: z.literal('cadre'),
      })
      .strict(),
  ],
)

export const membershipAccountClaimOptionsSchema = z
  .object({
    options: z
      .array(membershipIdentityOptionSchema)
      .length(3)
      .refine(
        (options) =>
          new Set(options.map((option) => option.membershipIdentity)).size ===
          options.length,
        { message: 'Membership identity options must be unique' },
      ),
    requestId: z.string().min(1).max(100),
  })
  .strict()

const membershipApplicationBaseShape = {
  contacts: membershipContactsSchema,
  fullName: membershipFullNameSchema,
  major: membershipMajorSchema,
  membershipIdentity: membershipIdentitySchema,
}

export const membershipAccountClaimSubmitSchema = z
  .object({
    ...membershipApplicationBaseShape,
    password: membershipPasswordSchema,
    passwordConfirmation: z.string(),
    studentNumber: membershipStudentNumberSchema,
  })
  .strict()
  .superRefine((command, context) => {
    if (command.password !== command.passwordConfirmation) {
      context.addIssue({
        code: 'custom',
        message: 'Password confirmation must match password',
        path: ['passwordConfirmation'],
      })
    }
    if (command.membershipIdentity !== 'member' && command.major === null) {
      context.addIssue({
        code: 'custom',
        message: 'Major is required for staff and cadre identities',
        path: ['major'],
      })
    }
  })

export const membershipAccountClaimPendingResultSchema = z
  .object({
    accountClaimId: z.string().uuid(),
    outcome: z.literal('pendingReview'),
    requestId: z.string().min(1).max(100),
    status: z.literal('pendingReview'),
    statusReceipt: z.string().min(80).max(1000),
    statusReceiptNotice: z.string().min(1).max(240),
    submittedAt: zonedDateTimeSchema,
  })
  .strict()

export const membershipAccountClaimManualResultSchema = z
  .object({
    outcome: z.literal('manualVerificationRequired'),
    requestId: z.string().min(1).max(100),
  })
  .strict()

export const membershipAccountClaimResultSchema = z.discriminatedUnion(
  'outcome',
  [
    membershipAccountClaimPendingResultSchema,
    membershipAccountClaimManualResultSchema,
  ],
)

export const membershipIntakeApplicationSubmitSchema = z
  .object({
    ...membershipApplicationBaseShape,
    privacyPurposeAccepted: z.literal(true),
    studentNumber: z.union([membershipStudentNumberSchema, z.null()]),
  })
  .strict()

export const membershipIntakeApplicationResultSchema = z
  .object({
    intakeApplicationId: z.string().uuid(),
    requestId: z.string().min(1).max(100),
    status: z.literal('pendingReview'),
    statusReceipt: z.string().min(80).max(1000),
    statusReceiptNotice: z.string().min(1).max(240),
    submittedAt: zonedDateTimeSchema,
  })
  .strict()

export const membershipStatusReceiptSchema = z
  .string()
  .min(80)
  .max(1000)
  .regex(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)

export const membershipStatusQuerySchema = z
  .object({ statusReceipt: membershipStatusReceiptSchema })
  .strict()

export const membershipPublicStatusSchema = z.enum([
  'pendingReview',
  'approvedCanLogin',
  'resubmissionRequired',
  'temporaryActivationContactAdmin',
  'intakeCompleted',
  'rejectedContactAssociation',
  'accountDisabled',
])

export const membershipStatusResultSchema = z
  .object({
    nextStep: z.string().min(1).max(300),
    publicMessage: z.string().max(300).nullable(),
    requestId: z.string().min(1).max(100),
    status: membershipPublicStatusSchema,
    updatedAt: zonedDateTimeSchema,
  })
  .strict()

export const applicationSubmitSchema = z
  .object({
    answers: z.record(z.string(), z.string()),
    formVersionId: z.string().uuid(),
  })
  .strict()

export const approveApplicationSchema = z
  .object({
    comment: z.string().max(1000).optional(),
    expectedVersion: z.number().int().min(1),
  })
  .strict()

export const publicFormSchema = z
  .object({
    formVersionId: z.string().uuid(),
    recruitmentCycleId: z.string().uuid(),
    schema: formSchema,
    schemaHash: z.string().regex(/^[a-f0-9]{64}$/),
    version: z.number().int().min(1),
  })
  .strict()

export const applicationResultSchema = z
  .object({
    formVersionId: z.string().uuid(),
    id: z.string().uuid(),
    recordVersion: z.number().int().min(1),
    status: z.enum(['pending', 'approved', 'rejected']),
    submittedAt: z.string(),
  })
  .strict()

export const approvalResultSchema = z
  .object({
    applicationId: z.string().uuid(),
    memberId: z.string().uuid(),
    recordVersion: z.number().int().min(2),
    status: z.literal('approved'),
  })
  .strict()

export const publishedFormVersionResultSchema = z
  .object({
    formDefinitionId: z.string().uuid(),
    formVersionId: z.string().uuid(),
    schemaHash: z.string().regex(/^[a-f0-9]{64}$/),
    version: z.number().int().min(1),
  })
  .strict()

export type ApiError = z.infer<typeof apiErrorSchema>
export type MembershipIdentity = z.infer<typeof membershipIdentitySchema>
export type MembershipContact = z.infer<typeof membershipContactSchema>
export type MembershipIdentityOption = z.infer<
  typeof membershipIdentityOptionSchema
>
export type MembershipAccountClaimOptions = z.infer<
  typeof membershipAccountClaimOptionsSchema
>
export type MembershipAccountClaimSubmit = z.infer<
  typeof membershipAccountClaimSubmitSchema
>
export type MembershipAccountClaimResult = z.infer<
  typeof membershipAccountClaimResultSchema
>
export type MembershipIntakeApplicationSubmit = z.infer<
  typeof membershipIntakeApplicationSubmitSchema
>
export type MembershipIntakeApplicationResult = z.infer<
  typeof membershipIntakeApplicationResultSchema
>
export type MembershipStatusQuery = z.infer<typeof membershipStatusQuerySchema>
export type MembershipStatusResult = z.infer<
  typeof membershipStatusResultSchema
>
export type PublicRichTextV1 = z.infer<typeof publicRichTextV1Schema>
export type PublicAnnouncementListItem = z.infer<
  typeof publicAnnouncementListItemSchema
>
export type PublicAnnouncementDetail = z.infer<
  typeof publicAnnouncementDetailSchema
>
export type PublicAnnouncementPage = z.infer<
  typeof publicAnnouncementPageSchema
>
export type PublicNewsListItem = z.infer<typeof publicNewsListItemSchema>
export type PublicNewsDetail = z.infer<typeof publicNewsDetailSchema>
export type PublicNewsPage = z.infer<typeof publicNewsPageSchema>
export type PublicGalleryImageVariant = z.infer<
  typeof publicGalleryImageVariantSchema
>
export type PublicGalleryImage = z.infer<typeof publicGalleryImageSchema>
export type PublicGalleryListItem = z.infer<typeof publicGalleryListItemSchema>
export type PublicGalleryDetail = z.infer<typeof publicGalleryDetailSchema>
export type PublicGalleryPage = z.infer<typeof publicGalleryPageSchema>
export type PublicActivityType = z.infer<typeof publicActivityTypeSchema>
export type PublicActivityStatus = z.infer<typeof publicActivityStatusSchema>
export type PublicActivityListItem = z.infer<
  typeof publicActivityListItemSchema
>
export type PublicActivityDetail = z.infer<typeof publicActivityDetailSchema>
export type PublicActivityPage = z.infer<typeof publicActivityPageSchema>
export type PublicAssociationContact = z.infer<
  typeof publicAssociationContactSchema
>
export type PublicAssociationHomePage = z.infer<
  typeof publicAssociationHomePageSchema
>
export type PublicAssociationAboutPage = z.infer<
  typeof publicAssociationAboutPageSchema
>
export type PublicAssociationContactPage = z.infer<
  typeof publicAssociationContactPageSchema
>
export type PublicAssociationPage = z.infer<typeof publicAssociationPageSchema>
export type ApplicationSubmit = z.infer<typeof applicationSubmitSchema>
export type ApproveApplication = z.infer<typeof approveApplicationSchema>
export type PublicForm = z.infer<typeof publicFormSchema>
export type ApplicationResult = z.infer<typeof applicationResultSchema>
export type ApprovalResult = z.infer<typeof approvalResultSchema>
export type PublishedFormVersionResult = z.infer<
  typeof publishedFormVersionResultSchema
>

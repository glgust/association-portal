import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
  type Response,
} from '@playwright/test'
import { randomUUID } from 'node:crypto'

const cmsUrl = process.env.PLAYWRIGHT_CMS_SERVER_URL ?? 'http://127.0.0.1:3201'

type AnnouncementDocument = {
  _status?: 'draft' | 'published'
  id: string
  slug: string
}

function unwrapDocument(value: unknown): AnnouncementDocument {
  expect(value).toBeTruthy()
  expect(typeof value).toBe('object')
  const response = value as Record<string, unknown>
  const document =
    response.doc && typeof response.doc === 'object'
      ? (response.doc as Record<string, unknown>)
      : response
  expect(typeof document.id).toBe('string')
  expect(typeof document.slug).toBe('string')
  return document as AnnouncementDocument
}

async function expectCmsNotFound(
  context: APIRequestContext,
  slug: string,
): Promise<void> {
  const response = await context.get(
    `/api/v1/content/announcements/${encodeURIComponent(slug)}`,
  )
  expect(response.status()).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
}

async function expectCmsListExcludes(
  context: APIRequestContext,
  announcementId: string,
): Promise<void> {
  const response = await context.get(
    '/api/v1/content/announcements?page=1&pageSize=50',
  )
  const body = (await response.json()) as {
    items?: Array<{ id: string }>
  }
  expect(response.ok(), JSON.stringify(body)).toBe(true)
  expect(body.items?.some((item) => item.id === announcementId)).toBe(false)
}

async function expectDefaultAnnouncementRestDenied(
  context: APIRequestContext,
  path: string,
): Promise<void> {
  const response = await context.get(path)
  expect(response.status()).toBe(403)
}

async function expectUnsafePaginationRejected(
  context: APIRequestContext,
): Promise<void> {
  for (const page of ['9007199254740992', '9'.repeat(400)]) {
    const response = await context.get(
      `/api/v1/content/announcements?page=${page}`,
    )
    expect(response.status()).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
  }
}

function expectStrictPublicDocument(value: unknown): void {
  expect(value).toBeTruthy()
  expect(typeof value).toBe('object')
  const document = value as Record<string, unknown>
  for (const internalField of [
    '_status',
    'createdBy',
    'lastEditedBy',
    'updatedAt',
    'createdAt',
  ]) {
    expect(document).not.toHaveProperty(internalField)
  }
  expect(document.body).toMatchObject({ version: 1 })
  expect(document.body).not.toHaveProperty('root')
}

function isAnnouncementWrite(
  response: Response,
  method: 'PATCH' | 'POST',
  id?: string,
): boolean {
  const url = new URL(response.url())
  const expectedPath = `/api/announcements${id ? `/${id}` : ''}`
  return (
    url.origin === cmsUrl &&
    url.pathname === expectedPath &&
    response.request().method() === method
  )
}

async function submitAnnouncement(
  adminPage: Page,
  options: {
    action: '#action-save' | '#action-save-draft'
    id?: string
    method: 'PATCH' | 'POST'
  },
): Promise<Response> {
  const button = adminPage.locator(options.action)
  await expect(button).toBeVisible()
  await expect(button).toBeEnabled()
  const responsePromise = adminPage.waitForResponse((response) =>
    isAnnouncementWrite(response, options.method, options.id),
  )
  await button.click()
  const response = await responsePromise
  expect(response.ok(), await response.text()).toBe(true)
  return response
}

async function fillAnnouncement(
  adminPage: Page,
  data: { body: string; summary?: string; title: string },
): Promise<void> {
  await adminPage.locator('#field-title').fill(data.title)
  if (data.summary !== undefined) {
    await adminPage.locator('#field-summary').fill(data.summary)
  }
  const editor = adminPage.locator(
    '[data-field-path="body"] .ContentEditable__root',
  )
  await expect(editor).toBeVisible()
  await editor.fill(data.body)
}

async function loginThroughAdmin(adminPage: Page): Promise<void> {
  await adminPage.goto(`${cmsUrl}/admin`)
  await adminPage.locator('#field-username').fill('e2e-staff')
  await adminPage.locator('#field-password').fill('Local-staff-Only-2026!')

  const loginResponsePromise = adminPage.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      url.origin === cmsUrl &&
      url.pathname === '/api/auth-users/login' &&
      response.request().method() === 'POST'
    )
  })
  await adminPage.getByRole('button', { exact: true, name: 'Login' }).click()
  const loginResponse = await loginResponsePromise
  expect(loginResponse.ok(), await loginResponse.text()).toBe(true)
  await expect(adminPage).toHaveURL(/\/admin(?:\/|$)/)
}

test('Payload Admin draft → publish → revise → republish → unpublish stays consistent on the public Web', async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000)
  const runId = randomUUID()
  const initialTitle = `虚构观测公告 ${runId}`
  const revisedTitle = `虚构观测公告新版 ${runId}`
  const initialText = `虚构第一版正文 ${runId}`
  const revisedText = `虚构第二版正文 ${runId}`
  const publicApi = await request.newContext({ baseURL: cmsUrl })
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()

  try {
    await expectDefaultAnnouncementRestDenied(publicApi, '/api/announcements')
    await expectUnsafePaginationRejected(publicApi)
    await loginThroughAdmin(adminPage)
    await adminPage.goto(`${cmsUrl}/admin/collections/announcements/create`)
    await fillAnnouncement(adminPage, {
      body: initialText,
      summary: `虚构摘要 ${runId}`,
      title: initialTitle,
    })

    const createResponse = await submitAnnouncement(adminPage, {
      action: '#action-save-draft',
      method: 'POST',
    })
    const draft = unwrapDocument(await createResponse.json())
    expect(draft._status).toBe('draft')
    await expect(adminPage).toHaveURL(
      new RegExp(`/admin/collections/announcements/${draft.id}(?:\\?|$)`),
    )

    await expectDefaultAnnouncementRestDenied(
      publicApi,
      `/api/announcements/${draft.id}`,
    )
    await expectCmsNotFound(publicApi, draft.slug)
    await expectCmsListExcludes(publicApi, draft.id)
    await page.goto('/announcements')
    await expect(
      page.getByRole('heading', { exact: true, name: initialTitle }),
    ).toHaveCount(0)
    await page.goto(`/announcements/${encodeURIComponent(draft.slug)}`)
    await expect(
      page.getByRole('heading', { name: '没有找到这篇公告' }),
    ).toBeVisible()

    const publishResponse = await submitAnnouncement(adminPage, {
      action: '#action-save',
      id: draft.id,
      method: 'PATCH',
    })
    expect(unwrapDocument(await publishResponse.json())._status).toBe(
      'published',
    )

    const firstPublicResponse = await publicApi.get(
      `/api/v1/content/announcements/${encodeURIComponent(draft.slug)}`,
    )
    const firstPublic = (await firstPublicResponse.json()) as {
      title?: string
    }
    expect(firstPublicResponse.ok(), JSON.stringify(firstPublic)).toBe(true)
    expectStrictPublicDocument(firstPublic)
    expect(firstPublic.title).toBe(initialTitle)
    await page.goto('/announcements')
    await expect(
      page.getByRole('heading', { exact: true, name: initialTitle }),
    ).toBeVisible()
    await page.goto(`/announcements/${encodeURIComponent(draft.slug)}`)
    await expect(
      page.getByRole('heading', { exact: true, name: initialTitle }),
    ).toBeVisible()
    await expect(page.getByText(initialText, { exact: true })).toBeVisible()

    await fillAnnouncement(adminPage, {
      body: revisedText,
      summary: `虚构新版摘要 ${runId}`,
      title: revisedTitle,
    })
    const newerDraftResponse = await submitAnnouncement(adminPage, {
      action: '#action-save-draft',
      id: draft.id,
      method: 'PATCH',
    })
    expect(unwrapDocument(await newerDraftResponse.json())._status).toBe(
      'draft',
    )

    const unchangedPublicResponse = await publicApi.get(
      `/api/v1/content/announcements/${encodeURIComponent(draft.slug)}`,
    )
    const unchangedPublic = (await unchangedPublicResponse.json()) as {
      title?: string
    }
    expect(unchangedPublicResponse.ok(), JSON.stringify(unchangedPublic)).toBe(
      true,
    )
    expect(unchangedPublic.title).toBe(initialTitle)
    await page.goto(`/announcements/${encodeURIComponent(draft.slug)}`)
    await expect(
      page.getByRole('heading', { exact: true, name: initialTitle }),
    ).toBeVisible()
    await expect(page.getByText(initialText, { exact: true })).toBeVisible()
    await expect(
      page.getByRole('heading', { exact: true, name: revisedTitle }),
    ).toHaveCount(0)

    const republishResponse = await submitAnnouncement(adminPage, {
      action: '#action-save',
      id: draft.id,
      method: 'PATCH',
    })
    expect(unwrapDocument(await republishResponse.json())._status).toBe(
      'published',
    )
    await page.goto(`/announcements/${encodeURIComponent(draft.slug)}`)
    await expect(
      page.getByRole('heading', { exact: true, name: revisedTitle }),
    ).toBeVisible()
    await expect(page.getByText(revisedText, { exact: true })).toBeVisible()
    await expect(page.getByText(initialText, { exact: true })).toHaveCount(0)

    const unpublishResponsePromise = adminPage.waitForResponse((response) =>
      isAnnouncementWrite(response, 'PATCH', draft.id),
    )
    await adminPage.locator('.doc-controls__popup .popup-button').click()
    await expect(adminPage.locator('#action-unpublish')).toBeVisible()
    await adminPage.locator('#action-unpublish').click()
    await expect(adminPage.locator('#confirm-action')).toBeVisible()
    await adminPage.locator('#confirm-action').click()
    const unpublishResponse = await unpublishResponsePromise
    expect(unpublishResponse.ok(), await unpublishResponse.text()).toBe(true)
    expect(unwrapDocument(await unpublishResponse.json())._status).toBe('draft')

    await expectCmsNotFound(publicApi, draft.slug)
    await expectCmsListExcludes(publicApi, draft.id)
    await page.goto('/announcements')
    await expect(
      page.getByRole('heading', { exact: true, name: revisedTitle }),
    ).toHaveCount(0)
    await page.goto(`/announcements/${encodeURIComponent(draft.slug)}`)
    await expect(
      page.getByRole('heading', { name: '没有找到这篇公告' }),
    ).toBeVisible()
  } finally {
    await Promise.all([publicApi.dispose(), adminContext.close()])
  }
})

test('an out-of-range announcement page shows the empty state', async ({
  page,
}) => {
  await page.goto('/announcements?page=999')
  await expect(
    page.getByRole('heading', { name: '暂时没有公告' }),
  ).toBeVisible()
  await expect(page.getByText('新公告发布后会显示在这里。')).toBeVisible()
})

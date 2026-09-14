import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test'
import { randomUUID } from 'node:crypto'

const cmsUrl = process.env.PLAYWRIGHT_CMS_SERVER_URL ?? 'http://127.0.0.1:3201'

type ActivityDocument = {
  _status?: 'draft' | 'published'
  id: string
  slug: string
}

function unwrapDocument(value: unknown): ActivityDocument {
  expect(value).toBeTruthy()
  expect(typeof value).toBe('object')
  const response = value as Record<string, unknown>
  const document =
    response.doc && typeof response.doc === 'object'
      ? (response.doc as Record<string, unknown>)
      : response
  expect(typeof document.id).toBe('string')
  expect(typeof document.slug).toBe('string')
  return document as ActivityDocument
}

function isActivityWrite(
  response: Response,
  method: 'PATCH' | 'POST',
  id?: string,
): boolean {
  const url = new URL(response.url())
  return (
    url.origin === cmsUrl &&
    url.pathname === `/api/activities${id ? `/${id}` : ''}` &&
    response.request().method() === method
  )
}

async function loginThroughAdmin(adminPage: Page): Promise<void> {
  await adminPage.goto(`${cmsUrl}/admin`)
  await adminPage.locator('#field-username').fill('e2e-staff')
  await adminPage.locator('#field-password').fill('Local-staff-Only-2026!')
  const responsePromise = adminPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth-users/login' &&
      response.request().method() === 'POST',
  )
  await adminPage.getByRole('button', { name: /^(登录|Login)$/ }).click()
  const response = await responsePromise
  expect(response.ok(), await response.text()).toBe(true)
  await expect(adminPage).toHaveURL(/\/admin(?:\/|$)/)
}

async function choose(
  adminPage: Page,
  fieldPath: string,
  label: string,
): Promise<void> {
  await adminPage
    .locator(`#field-${fieldPath.replace(/\./g, '__')} .react-select`)
    .click()
  await adminPage.getByText(label, { exact: true }).last().click()
}

async function fillBody(adminPage: Page, value: string): Promise<void> {
  const editor = adminPage.locator(
    '[data-field-path="body"] .ContentEditable__root',
  )
  await expect(editor).toBeVisible()
  await editor.fill(value)
}

async function fillDateTime(
  adminPage: Page,
  fieldPath: 'endsAt' | 'startsAt',
  value: string,
): Promise<void> {
  const input = adminPage.locator(`#field-${fieldPath} input`).first()
  await expect(input).toBeVisible()
  await input.fill(value)
  await input.press('Tab')
}

async function submit(
  adminPage: Page,
  options: {
    action: '#action-save' | '#action-save-draft'
    id?: string
    method: 'PATCH' | 'POST'
  },
): Promise<Response> {
  const responsePromise = adminPage.waitForResponse((response) =>
    isActivityWrite(response, options.method, options.id),
  )
  const button = adminPage.locator(options.action)
  await expect(button).toBeVisible()
  await expect(button).toBeEnabled()
  await button.click()
  const response = await responsePromise
  expect(response.ok(), await response.text()).toBe(true)
  return response
}

async function unpublish(adminPage: Page, id: string): Promise<Response> {
  const responsePromise = adminPage.waitForResponse((response) =>
    isActivityWrite(response, 'PATCH', id),
  )
  await adminPage.locator('.doc-controls__popup .popup-button').click()
  await expect(adminPage.locator('#action-unpublish')).toBeVisible()
  await adminPage.locator('#action-unpublish').click()
  await expect(adminPage.locator('#confirm-action')).toBeVisible()
  await adminPage.locator('#confirm-action').click()
  const response = await responsePromise
  expect(response.ok(), await response.text()).toBe(true)
  return response
}

async function expectPublicNotFound(
  api: APIRequestContext,
  slug: string,
): Promise<void> {
  const response = await api.get(
    `/api/v1/content/activities/${encodeURIComponent(slug)}`,
  )
  expect(response.status()).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
}

async function expectListExcludes(
  api: APIRequestContext,
  id: string,
): Promise<void> {
  const response = await api.get(
    '/api/v1/content/activities?page=1&pageSize=50',
  )
  const body = (await response.json()) as { items?: Array<{ id: string }> }
  expect(response.ok(), JSON.stringify(body)).toBe(true)
  expect(body.items?.some((item) => item.id === id)).toBe(false)
}

async function expectMultiline(locator: Locator, value: string): Promise<void> {
  await expect(locator).toBeVisible()
  expect(
    await locator.evaluate((element) => ({
      text: element.textContent,
      whiteSpace: getComputedStyle(element).whiteSpace,
    })),
  ).toEqual({ text: value, whiteSpace: 'pre-line' })
}

function expectStrictPublicActivity(value: unknown): void {
  expect(value).toBeTruthy()
  expect(typeof value).toBe('object')
  const activity = value as Record<string, unknown>
  for (const internalField of [
    '_status',
    'createdAt',
    'createdBy',
    'historySortAt',
    'isCancelled',
    'lastEditedBy',
    'updatedAt',
  ]) {
    expect(activity).not.toHaveProperty(internalField)
  }
  expect(activity.body).toMatchObject({ version: 1 })
  expect(activity.body).not.toHaveProperty('root')
}

test('Payload Admin publishes, cancels, and unpublishes temporary activities', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000)
  const runId = randomUUID()
  const title = `虚构星空观测活动 ${runId}`
  const summary = `虚构活动摘要第一行 ${runId}\n虚构活动摘要第二行`
  const bodyText = `虚构活动介绍 ${runId}`
  const cancellationNote = `虚构取消说明第一行 ${runId}\n虚构取消说明第二行`
  const publicApi = await request.newContext({ baseURL: cmsUrl })
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()

  try {
    expect((await publicApi.get('/api/activities')).status()).toBe(403)
    expect((await publicApi.get('/api/activities/example')).status()).toBe(403)
    for (const path of [
      '/api/v1/content/activities?extra=unknown',
      '/api/v1/content/activities?page=9007199254740992',
      `/api/v1/content/activities?page=${'9'.repeat(400)}`,
    ]) {
      const response = await publicApi.get(path)
      expect(response.status()).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
    }
    expect(
      (
        await publicApi.get('/api/v1/content/activities/not%20a%20slug')
      ).status(),
    ).toBe(404)

    await loginThroughAdmin(adminPage)
    await adminPage.goto(`${cmsUrl}/admin/collections/activities/create`)
    await choose(adminPage, 'activityType', '临时活动')
    await adminPage.locator('#field-title').fill(title)
    await adminPage.locator('#field-summary').fill(summary)
    await adminPage.locator('#field-location').fill('虚构北校区观测场')
    await fillDateTime(adminPage, 'startsAt', '2035-08-20 20:00')
    await fillDateTime(adminPage, 'endsAt', '2035-08-20 22:00')
    await fillBody(adminPage, bodyText)

    const draftResponse = await submit(adminPage, {
      action: '#action-save-draft',
      method: 'POST',
    })
    const draft = unwrapDocument(await draftResponse.json())
    expect(draft._status).toBe('draft')
    await expectPublicNotFound(publicApi, draft.slug)
    await expectListExcludes(publicApi, draft.id)
    await page.goto(`/activities/${encodeURIComponent(draft.slug)}`)
    await expect(
      page.getByRole('heading', { name: '没有找到这项活动' }),
    ).toBeVisible()

    const publishResponse = await submit(adminPage, {
      action: '#action-save',
      id: draft.id,
      method: 'PATCH',
    })
    expect(unwrapDocument(await publishResponse.json())._status).toBe(
      'published',
    )

    const firstPublicResponse = await publicApi.get(
      `/api/v1/content/activities/${encodeURIComponent(draft.slug)}`,
    )
    const firstPublic = (await firstPublicResponse.json()) as Record<
      string,
      unknown
    >
    expect(firstPublicResponse.ok(), JSON.stringify(firstPublic)).toBe(true)
    expectStrictPublicActivity(firstPublic)
    expect(firstPublic).toMatchObject({
      activityType: 'temporary',
      cancellationNote: null,
      location: '虚构北校区观测场',
      status: 'upcoming',
      summary,
      title,
    })
    expect(firstPublic).toHaveProperty('startsAt')
    expect(firstPublic).toHaveProperty('endsAt')
    expect(firstPublic).not.toHaveProperty('scheduleText')

    await page.goto('/activities')
    await expect(
      page.getByRole('heading', { exact: true, name: title }),
    ).toBeVisible()
    await expectMultiline(
      page
        .locator('.activity-card')
        .filter({ hasText: title })
        .locator('.activity-multiline')
        .filter({ hasText: '虚构活动摘要第一行' }),
      summary,
    )
    await page.goto(`/activities/${encodeURIComponent(draft.slug)}`)
    await expect(
      page.getByRole('heading', { exact: true, name: title }),
    ).toBeVisible()
    await expect(page.getByText(bodyText, { exact: true })).toBeVisible()
    await expectMultiline(
      page.locator('.activity-article-heading .activity-multiline'),
      summary,
    )
    await expect(
      page
        .locator('.activity-facts')
        .getByText('虚构北校区观测场', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText('即将开始', { exact: true })).toBeVisible()

    await adminPage.locator('#field-isCancelled').check()
    await adminPage.locator('#field-cancellationNote').fill(cancellationNote)
    const cancellationDraftResponse = await submit(adminPage, {
      action: '#action-save-draft',
      id: draft.id,
      method: 'PATCH',
    })
    expect(unwrapDocument(await cancellationDraftResponse.json())._status).toBe(
      'draft',
    )

    const unchangedResponse = await publicApi.get(
      `/api/v1/content/activities/${encodeURIComponent(draft.slug)}`,
    )
    expect(await unchangedResponse.json()).toMatchObject({
      cancellationNote: null,
      status: 'upcoming',
    })
    await page.goto(`/activities/${encodeURIComponent(draft.slug)}`)
    await expect(page.getByText(cancellationNote, { exact: true })).toHaveCount(
      0,
    )

    const republishResponse = await submit(adminPage, {
      action: '#action-save',
      id: draft.id,
      method: 'PATCH',
    })
    expect(unwrapDocument(await republishResponse.json())._status).toBe(
      'published',
    )
    const cancelledResponse = await publicApi.get(
      `/api/v1/content/activities/${encodeURIComponent(draft.slug)}`,
    )
    expect(await cancelledResponse.json()).toMatchObject({
      cancellationNote,
      status: 'cancelled',
    })
    await page.goto(`/activities/${encodeURIComponent(draft.slug)}`)
    await expect(
      page.getByRole('heading', { name: '活动已取消' }),
    ).toBeVisible()
    await expect(
      page.getByText(cancellationNote, { exact: true }),
    ).toBeVisible()
    await expectMultiline(
      page.locator('.activity-cancellation .activity-multiline'),
      cancellationNote,
    )

    const unpublishResponse = await unpublish(adminPage, draft.id)
    expect(unwrapDocument(await unpublishResponse.json())._status).toBe('draft')
    await expectPublicNotFound(publicApi, draft.slug)
    await expectListExcludes(publicApi, draft.id)
    await page.goto(`/activities/${encodeURIComponent(draft.slug)}`)
    await expect(
      page.getByRole('heading', { name: '没有找到这项活动' }),
    ).toBeVisible()
  } finally {
    await Promise.all([publicApi.dispose(), adminContext.close()])
  }
})

test('Payload Admin publishes a standing activity with its fixed schedule', async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000)
  const runId = randomUUID()
  const title = `虚构常驻天文交流夜 ${runId}`
  const summary = `虚构常驻摘要第一行 ${runId}\n虚构常驻摘要第二行`
  const scheduleText = '每周五 19:30–21:00\n每周六 20:00–21:00'
  const publicApi = await request.newContext({ baseURL: cmsUrl })
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()

  try {
    await loginThroughAdmin(adminPage)
    await adminPage.goto(`${cmsUrl}/admin/collections/activities/create`)
    await choose(adminPage, 'activityType', '常驻活动')
    await adminPage.locator('#field-title').fill(title)
    await adminPage.locator('#field-summary').fill(summary)
    await adminPage.locator('#field-location').fill('虚构活动室')
    await adminPage.locator('#field-scheduleText').fill(scheduleText)
    await fillBody(adminPage, `虚构常驻活动介绍 ${runId}`)
    const publishResponse = await submit(adminPage, {
      action: '#action-save',
      method: 'POST',
    })
    const activity = unwrapDocument(await publishResponse.json())
    expect(activity._status).toBe('published')

    const publicResponse = await publicApi.get(
      `/api/v1/content/activities/${encodeURIComponent(activity.slug)}`,
    )
    const publicActivity = (await publicResponse.json()) as Record<
      string,
      unknown
    >
    expect(publicResponse.ok(), JSON.stringify(publicActivity)).toBe(true)
    expectStrictPublicActivity(publicActivity)
    expect(publicActivity).toMatchObject({
      activityType: 'standing',
      location: '虚构活动室',
      scheduleText,
      status: 'ongoing',
      summary,
      title,
    })
    expect(publicActivity).not.toHaveProperty('startsAt')
    expect(publicActivity).not.toHaveProperty('endsAt')

    await page.goto(`/activities/${encodeURIComponent(activity.slug)}`)
    await expect(
      page.getByRole('heading', { exact: true, name: title }),
    ).toBeVisible()
    await expect(page.getByText('进行中', { exact: true })).toBeVisible()
    await expectMultiline(
      page.locator('.activity-facts dd.activity-multiline'),
      scheduleText,
    )
  } finally {
    await Promise.all([publicApi.dispose(), adminContext.close()])
  }
})

import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
  type Response,
} from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const cmsUrl = process.env.PLAYWRIGHT_CMS_SERVER_URL ?? 'http://127.0.0.1:3201'

test.beforeAll(() => {
  // This scenario creates all three unique page identities from an empty state.
  // The seed helper checks that both the database and media root are E2E-only.
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed-e2e.ts'], {
    env: { ...process.env, E2E_CLEAR_CONTENT_ONLY: 'true' },
    stdio: 'inherit',
  })
})

type PageDocument = { _status?: 'draft' | 'published'; id: string }

function unwrapDocument(value: unknown): PageDocument {
  const response = value as Record<string, unknown>
  const document =
    response.doc && typeof response.doc === 'object'
      ? (response.doc as Record<string, unknown>)
      : response
  expect(typeof document.id).toBe('string')
  return document as PageDocument
}

function isPageWrite(
  response: Response,
  method: 'PATCH' | 'POST',
  id?: string,
): boolean {
  const url = new URL(response.url())
  return (
    url.origin === cmsUrl &&
    url.pathname === `/api/association-pages${id ? `/${id}` : ''}` &&
    response.request().method() === method
  )
}

function isAnnouncementWrite(
  response: Response,
  method: 'PATCH' | 'POST',
  id?: string,
): boolean {
  const url = new URL(response.url())
  return (
    url.origin === cmsUrl &&
    url.pathname === `/api/announcements${id ? `/${id}` : ''}` &&
    response.request().method() === method
  )
}

async function login(adminPage: Page): Promise<void> {
  await adminPage.goto(`${cmsUrl}/admin`)
  await adminPage.locator('#field-username').fill('e2e-staff')
  await adminPage.locator('#field-password').fill('Local-staff-Only-2026!')
  await Promise.all([
    adminPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/auth-users/login' &&
        response.request().method() === 'POST',
    ),
    adminPage.getByRole('button', { name: /^(登录|Login)$/ }).click(),
  ])
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

async function submit(
  adminPage: Page,
  action: '#action-save' | '#action-save-draft',
  method: 'PATCH' | 'POST',
  id?: string,
): Promise<Response> {
  const responsePromise = adminPage.waitForResponse((response) =>
    isPageWrite(response, method, id),
  )
  await adminPage.locator(action).click()
  return responsePromise
}

async function expectPublicNotFound(
  api: APIRequestContext,
  pageKey: string,
): Promise<void> {
  const response = await api.get(`/api/v1/content/association-pages/${pageKey}`)
  expect(response.status()).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
}

async function unpublish(adminPage: Page, id: string): Promise<Response> {
  const responsePromise = adminPage.waitForResponse((response) =>
    isPageWrite(response, 'PATCH', id),
  )
  await adminPage.locator('.doc-controls__popup .popup-button').click()
  await adminPage.locator('#action-unpublish').click()
  await adminPage.locator('#confirm-action').click()
  return responsePromise
}

async function submitAnnouncement(
  adminPage: Page,
  method: 'PATCH' | 'POST',
  id?: string,
): Promise<Response> {
  const responsePromise = adminPage.waitForResponse((response) =>
    isAnnouncementWrite(response, method, id),
  )
  await adminPage
    .locator(method === 'POST' ? '#action-save-draft' : '#action-save')
    .click()
  return responsePromise
}

async function unpublishAnnouncement(
  adminPage: Page,
  id: string,
): Promise<Response> {
  const responsePromise = adminPage.waitForResponse((response) =>
    isAnnouncementWrite(response, 'PATCH', id),
  )
  await adminPage.locator('.doc-controls__popup .popup-button').click()
  await adminPage.locator('#action-unpublish').click()
  await adminPage.locator('#confirm-action').click()
  return responsePromise
}

test('Payload Admin manages the three fixed association pages and one contact source', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000)
  const runId = randomUUID()
  const publicApi = await request.newContext({ baseURL: cmsUrl })
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  const created = new Map<string, PageDocument>()

  try {
    expect((await publicApi.get('/api/association-pages')).status()).toBe(403)
    await login(adminPage)

    for (const pageKey of ['home', 'about', 'contact'] as const) {
      const title = `虚构 ${pageKey} 页面 ${runId}`
      await adminPage.goto(
        `${cmsUrl}/admin/collections/association-pages/create`,
      )
      await choose(
        adminPage,
        'pageKey',
        pageKey === 'home'
          ? '首页'
          : pageKey === 'about'
            ? '关于协会'
            : '联系方式',
      )
      await adminPage.locator('#field-title').fill(title)
      await fillBody(adminPage, `虚构 ${pageKey} 第一版正文 ${runId}`)
      if (pageKey === 'home') {
        await adminPage.locator('#field-lead').fill('虚构首页引导语')
      }
      if (pageKey === 'contact') {
        await adminPage.locator('.array-field__add-row').click()
        await choose(adminPage, 'contacts.0.type', '邮箱')
        await adminPage
          .locator('#field-contacts__0__label')
          .fill('虚构协会邮箱')
        await adminPage
          .locator('#field-contacts__0__value')
          .fill('association@example.test')
        await adminPage.locator('#field-contacts__0__isPublic').check()
        await adminPage.locator('#field-contacts__0__showOnHome').check()
      }

      const draftResponse = await submit(
        adminPage,
        '#action-save-draft',
        'POST',
      )
      expect(draftResponse.ok(), await draftResponse.text()).toBe(true)
      const draft = unwrapDocument(await draftResponse.json())
      created.set(pageKey, draft)
      await expectPublicNotFound(publicApi, pageKey)

      // Payload navigates after create through a client transition. Re-enter the
      // persisted edit route so Publish uses PATCH instead of replaying create.
      await adminPage.goto(
        `${cmsUrl}/admin/collections/association-pages/${draft.id}`,
      )
      await expect(adminPage.locator('#action-save')).toBeVisible()

      const publishResponse = await submit(
        adminPage,
        '#action-save',
        'PATCH',
        draft.id,
      )
      expect(publishResponse.ok(), await publishResponse.text()).toBe(true)
      expect(unwrapDocument(await publishResponse.json())._status).toBe(
        'published',
      )
    }

    const activityRequests: string[] = []
    page.on('request', (browserRequest) => {
      if (new URL(browserRequest.url()).pathname.includes('/activities')) {
        activityRequests.push(browserRequest.url())
      }
    })
    await page.goto('/')
    await expect(page.getByRole('link', { name: '活动目录' })).toBeVisible()
    expect(activityRequests).toEqual([])
    await expect(page.getByText('暂无公开公告。')).toBeVisible()

    const announcementTitle = `虚构首页公告 ${runId}`
    await adminPage.goto(`${cmsUrl}/admin/collections/announcements/create`)
    await adminPage.locator('#field-title').fill(announcementTitle)
    await adminPage.locator('#field-summary').fill('虚构首页公告摘要')
    await fillBody(adminPage, `虚构首页公告正文 ${runId}`)
    const announcementDraftResponse = await submitAnnouncement(
      adminPage,
      'POST',
    )
    expect(
      announcementDraftResponse.ok(),
      await announcementDraftResponse.text(),
    ).toBe(true)
    const announcement = unwrapDocument(await announcementDraftResponse.json())
    await adminPage.goto(
      `${cmsUrl}/admin/collections/announcements/${announcement.id}`,
    )
    const announcementPublishResponse = await submitAnnouncement(
      adminPage,
      'PATCH',
      announcement.id,
    )
    expect(
      announcementPublishResponse.ok(),
      await announcementPublishResponse.text(),
    ).toBe(true)
    await page.goto('/')
    await expect(
      page.getByRole('heading', { exact: true, name: announcementTitle }),
    ).toBeVisible()

    const announcementUnpublishResponse = await unpublishAnnouncement(
      adminPage,
      announcement.id,
    )
    expect(
      announcementUnpublishResponse.ok(),
      await announcementUnpublishResponse.text(),
    ).toBe(true)
    await page.goto('/')
    await expect(
      page.getByRole('heading', { exact: true, name: announcementTitle }),
    ).toHaveCount(0)
    await expect(page.getByText('暂无公开公告。')).toBeVisible()

    const contactResponse = await publicApi.get(
      '/api/v1/content/association-pages/contact',
    )
    const contact = (await contactResponse.json()) as Record<string, unknown>
    expect(contactResponse.ok(), JSON.stringify(contact)).toBe(true)
    expect(contact).not.toHaveProperty('_status')
    expect(JSON.stringify(contact)).not.toContain('isPublic')
    expect(contact).not.toHaveProperty('createdBy')

    await page.goto('/')
    await expect(page.getByText('association@example.test')).toBeVisible()
    await page.goto('/contact')
    await expect(page.getByText('association@example.test')).toBeVisible()
    await page.goto('/about')
    await expect(
      page.getByRole('heading', {
        name: `虚构 about 页面 ${runId}`,
      }),
    ).toBeVisible()

    const contactId = created.get('contact')!.id
    await adminPage.goto(
      `${cmsUrl}/admin/collections/association-pages/${contactId}`,
    )
    await adminPage
      .locator('#field-contacts__0__value')
      .fill('association-new@example.test')
    const newerDraft = await submit(
      adminPage,
      '#action-save-draft',
      'PATCH',
      contactId,
    )
    expect(newerDraft.ok(), await newerDraft.text()).toBe(true)
    await page.goto('/contact')
    await expect(page.getByText('association@example.test')).toBeVisible()
    await expect(page.getByText('association-new@example.test')).toHaveCount(0)
    const republish = await submit(
      adminPage,
      '#action-save',
      'PATCH',
      contactId,
    )
    expect(republish.ok(), await republish.text()).toBe(true)
    await page.goto('/contact')
    await expect(page.getByText('association-new@example.test')).toBeVisible()

    for (const pageKey of ['about', 'contact'] as const) {
      const id = created.get(pageKey)!.id
      await adminPage.goto(
        `${cmsUrl}/admin/collections/association-pages/${id}`,
      )
      const response = await unpublish(adminPage, id)
      expect(response.ok(), await response.text()).toBe(true)
      await expectPublicNotFound(publicApi, pageKey)
    }
    await page.goto('/about')
    await expect(
      page.getByRole('heading', { name: '协会介绍尚未公开' }),
    ).toBeVisible()
    await page.goto('/contact')
    await expect(
      page.getByRole('heading', { name: '联系方式尚未公开' }),
    ).toBeVisible()
    await page.goto('/')
    await expect(page.getByText('association-new@example.test')).toHaveCount(0)

    const homeId = created.get('home')!.id
    await adminPage.goto(
      `${cmsUrl}/admin/collections/association-pages/${homeId}`,
    )
    const rejectedHome = await unpublish(adminPage, homeId)
    expect(rejectedHome.ok()).toBe(false)
    const homeResponse = await publicApi.get(
      '/api/v1/content/association-pages/home',
    )
    expect(homeResponse.ok(), await homeResponse.text()).toBe(true)
  } finally {
    await Promise.all([publicApi.dispose(), adminContext.close()])
  }
})

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

type NewsDocument = {
  _status?: 'draft' | 'published'
  id: string
  publishedAt?: string
  slug: string
}

function unwrapDocument(value: unknown): NewsDocument {
  expect(value).toBeTruthy()
  expect(typeof value).toBe('object')
  const response = value as Record<string, unknown>
  const document =
    response.doc && typeof response.doc === 'object'
      ? (response.doc as Record<string, unknown>)
      : response
  expect(typeof document.id).toBe('string')
  expect(typeof document.slug).toBe('string')
  return document as NewsDocument
}

function isNewsWrite(
  response: Response,
  method: 'PATCH' | 'POST',
  id?: string,
) {
  const url = new URL(response.url())
  return (
    url.origin === cmsUrl &&
    url.pathname === `/api/news${id ? `/${id}` : ''}` &&
    response.request().method() === method
  )
}

async function login(adminPage: Page) {
  await adminPage.goto(`${cmsUrl}/admin`)
  await adminPage.locator('#field-username').fill('e2e-staff')
  await adminPage.locator('#field-password').fill('Local-staff-Only-2026!')
  const responsePromise = adminPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth-users/login' &&
      response.request().method() === 'POST',
  )
  await adminPage.getByRole('button', { name: /登录|Login/ }).click()
  expect((await responsePromise).ok()).toBe(true)
  await expect(adminPage).toHaveURL(/\/admin(?:\/|$)/)
}

async function fillNews(
  adminPage: Page,
  data: { body: string; summary: string; title: string },
) {
  await adminPage.locator('#field-title').fill(data.title)
  await adminPage.locator('#field-summary').fill(data.summary)
  const editor = adminPage.locator(
    '[data-field-path="body"] .ContentEditable__root',
  )
  await expect(editor).toBeVisible()
  await editor.fill(data.body)
}

async function submit(
  adminPage: Page,
  options: {
    action: '#action-save' | '#action-save-draft'
    id?: string
    method: 'PATCH' | 'POST'
  },
) {
  const responsePromise = adminPage.waitForResponse((response) =>
    isNewsWrite(response, options.method, options.id),
  )
  const button = adminPage.locator(options.action)
  await expect(button).toBeVisible()
  await expect(button).toBeEnabled()
  await button.click()
  const response = await responsePromise
  expect(response.ok(), await response.text()).toBe(true)
  return response
}

async function expectNotFound(api: APIRequestContext, slug: string) {
  const response = await api.get(
    `/api/v1/content/news/${encodeURIComponent(slug)}`,
  )
  expect(response.status()).toBe(404)
  expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
}

async function expectListExcludes(api: APIRequestContext, id: string) {
  const response = await api.get('/api/v1/content/news?page=1&pageSize=50')
  const body = (await response.json()) as { items?: Array<{ id: string }> }
  expect(response.ok(), JSON.stringify(body)).toBe(true)
  expect(body.items?.some((item) => item.id === id)).toBe(false)
}

function expectStrictPublicNews(value: unknown) {
  expect(value).toBeTruthy()
  expect(typeof value).toBe('object')
  const news = value as Record<string, unknown>
  expect(Object.keys(news).sort()).toEqual(
    ['body', 'id', 'publishedAt', 'slug', 'summary', 'title'].sort(),
  )
  expect(news.body).toMatchObject({ version: 1 })
  expect(news.body).not.toHaveProperty('root')
}

test('Payload Admin News draft → publish → revise → republish → unpublish stays public-safe', async ({
  browser,
  page,
}) => {
  test.setTimeout(150_000)
  const runId = randomUUID()
  const initialTitle = `虚构协会新闻 ${runId}`
  const revisedTitle = `虚构协会新闻新版 ${runId}`
  const initialBody = `虚构新闻第一版正文 ${runId}`
  const revisedBody = `虚构新闻第二版正文 ${runId}`
  const api = await request.newContext({ baseURL: cmsUrl })
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()

  try {
    expect((await api.get('/api/news')).status()).toBe(403)
    expect((await api.get('/api/news/example')).status()).toBe(403)
    for (const path of [
      '/api/v1/content/news?extra=unknown',
      '/api/v1/content/news?page=9007199254740992',
      `/api/v1/content/news?page=${'9'.repeat(400)}`,
    ]) {
      const response = await api.get(path)
      expect(response.status()).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
    }

    await page.goto('/')
    const newsEntry = page.getByRole('link', { exact: true, name: /新闻/ })
    await expect(newsEntry).toBeVisible()
    await newsEntry.focus()
    await expect(newsEntry).toBeFocused()

    await login(adminPage)
    await adminPage.goto(`${cmsUrl}/admin/collections/news/create`)
    await fillNews(adminPage, {
      body: initialBody,
      summary: `虚构摘要 ${runId}`,
      title: initialTitle,
    })
    const draft = unwrapDocument(
      await (
        await submit(adminPage, {
          action: '#action-save-draft',
          method: 'POST',
        })
      ).json(),
    )
    expect(draft._status).toBe('draft')
    await expectNotFound(api, draft.slug)
    await expectListExcludes(api, draft.id)

    const firstPublished = unwrapDocument(
      await (
        await submit(adminPage, {
          action: '#action-save',
          id: draft.id,
          method: 'PATCH',
        })
      ).json(),
    )
    expect(firstPublished._status).toBe('published')
    expect(firstPublished.publishedAt).toBeTruthy()
    const firstResponse = await api.get(
      `/api/v1/content/news/${encodeURIComponent(draft.slug)}`,
    )
    const firstPublic = await firstResponse.json()
    expect(firstResponse.ok(), JSON.stringify(firstPublic)).toBe(true)
    expectStrictPublicNews(firstPublic)
    expect(firstPublic).toMatchObject({ title: initialTitle })
    await page.goto(`/news/${encodeURIComponent(draft.slug)}`)
    await expect(
      page.getByRole('heading', { exact: true, name: initialTitle }),
    ).toBeVisible()
    await expect(page.getByText(initialBody, { exact: true })).toBeVisible()

    await fillNews(adminPage, {
      body: revisedBody,
      summary: `虚构新版摘要 ${runId}`,
      title: revisedTitle,
    })
    expect(
      unwrapDocument(
        await (
          await submit(adminPage, {
            action: '#action-save-draft',
            id: draft.id,
            method: 'PATCH',
          })
        ).json(),
      )._status,
    ).toBe('draft')
    expect(
      await (
        await api.get(`/api/v1/content/news/${encodeURIComponent(draft.slug)}`)
      ).json(),
    ).toMatchObject({ title: initialTitle })

    const republished = unwrapDocument(
      await (
        await submit(adminPage, {
          action: '#action-save',
          id: draft.id,
          method: 'PATCH',
        })
      ).json(),
    )
    expect(republished.publishedAt).not.toBe(firstPublished.publishedAt)
    await page.goto(`/news/${encodeURIComponent(draft.slug)}`)
    await expect(
      page.getByRole('heading', { exact: true, name: revisedTitle }),
    ).toBeVisible()
    await expect(page.getByText(revisedBody, { exact: true })).toBeVisible()

    const unpublishPromise = adminPage.waitForResponse((response) =>
      isNewsWrite(response, 'PATCH', draft.id),
    )
    await adminPage.locator('.doc-controls__popup .popup-button').click()
    await adminPage.locator('#action-unpublish').click()
    await adminPage.locator('#confirm-action').click()
    expect((await unpublishPromise).ok()).toBe(true)
    await expectNotFound(api, draft.slug)
    await expectListExcludes(api, draft.id)
    await page.goto(`/news/${encodeURIComponent(draft.slug)}`)
    await expect(
      page.getByRole('heading', { name: '没有找到这篇新闻' }),
    ).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/news')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390)
  } finally {
    await Promise.all([api.dispose(), adminContext.close()])
  }
})

test('an out-of-range News page shows the empty state', async ({ page }) => {
  await page.goto('/news?page=999')
  const emptyNotice = page.locator('.news-shell .empty')
  await expect(emptyNotice).toBeVisible()
  await expect(emptyNotice).toHaveText('暂时没有公开新闻')
})

import {
  expect,
  request,
  test,
  type Page,
  type Response,
} from '@playwright/test'
import sharp from 'sharp'

const cmsUrl = process.env.PLAYWRIGHT_CMS_SERVER_URL ?? 'http://127.0.0.1:3201'

type GalleryDocument = {
  _status?: 'draft' | 'published'
  id: string
  slug: string
}

function unwrapGalleryDocument(value: unknown): GalleryDocument {
  const response = value as Record<string, unknown>
  const document =
    response.doc && typeof response.doc === 'object'
      ? (response.doc as Record<string, unknown>)
      : response
  expect(typeof document.id).toBe('string')
  expect(typeof document.slug).toBe('string')
  return document as GalleryDocument
}

function isGalleryWrite(
  response: Response,
  method: 'PATCH' | 'POST',
  id?: string,
): boolean {
  const url = new URL(response.url())
  return (
    url.origin === cmsUrl &&
    url.pathname === `/api/gallery-works${id ? `/${id}` : ''}` &&
    response.request().method() === method
  )
}

async function chooseRelationship(page: Page, field: string, label: string) {
  const fieldRoot = page.locator(`#field-${field}`)
  const combobox = fieldRoot.getByRole('combobox')
  await combobox.click()
  await combobox.fill(label)
  await fieldRoot.getByRole('option', { exact: true, name: label }).click()
}

async function submitGallery(
  page: Page,
  action: '#action-save' | '#action-save-draft',
  method: 'PATCH' | 'POST',
  id?: string,
): Promise<Response> {
  const response = page.waitForResponse((candidate) =>
    isGalleryWrite(candidate, method, id),
  )
  await page.locator(action).click()
  return response
}

async function unpublishGallery(page: Page, id: string): Promise<Response> {
  const response = page.waitForResponse((candidate) =>
    isGalleryWrite(candidate, 'PATCH', id),
  )
  await page.locator('.doc-controls__popup .popup-button').click()
  await page.locator('#action-unpublish').click()
  await page.locator('#confirm-action').click()
  return response
}

async function login(
  page: Page,
  username = 'e2e-owner',
  password = 'Local-owner-Only-2026!',
) {
  await page.goto(`${cmsUrl}/admin`)
  await page.locator('#field-username').fill(username)
  await page.locator('#field-password').fill(password)
  const loginResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth-users/login' &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: /登录|Login/ }).click()
  expect((await loginResponse).ok()).toBe(true)
}

async function uploadThroughAdmin(page: Page, name: string) {
  await page.goto(`${cmsUrl}/admin/media-assets`)
  const png = await sharp({
    create: {
      background: name.includes('second') ? 'orange' : 'navy',
      channels: 3,
      height: 3,
      width: 5,
    },
  })
    .png()
    .toBuffer()
  await page.locator('#media-file').setInputFiles({
    buffer: png,
    mimeType: 'image/png',
    name,
  })
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        '/api/v1/admin/media-assets/upload' &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '上传并生成站点版本' }).click()
  const response = await responsePromise
  expect(response.status(), await response.text()).toBe(201)
  return (await response.json()) as { id: string }
}

test('Gallery public pages and controlled media delivery remain private and responsive', async ({
  page,
}) => {
  const cms = await request.newContext({ baseURL: cmsUrl })
  expect((await cms.get('/api/media-assets')).status()).toBe(403)
  expect((await cms.get('/api/gallery-works')).status()).toBe(403)

  await page.goto('/gallery')
  await expect(page.getByRole('heading', { name: '协会作品' })).toBeVisible()
  const work = page.getByRole('link', {
    exact: true,
    name: 'E2E 虚构星云作品',
  })
  await work.focus()
  await expect(work).toBeFocused()
  await work.click()
  await expect(
    page.getByRole('heading', { name: 'E2E 虚构星云作品' }),
  ).toBeVisible()
  await expect(page.getByText('虚构星野')).toBeVisible()
  const image = page.getByRole('img', {
    exact: true,
    name: 'E2E 虚构星云作品的自制纯色测试图',
  })
  await expect(image).toBeVisible()
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBeGreaterThan(0)

  await page.setViewportSize({ height: 844, width: 390 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await expect(image).toHaveCSS('object-fit', 'contain')

  const missing = await page.request.get(
    '/media/gallery/not-published/image/detail',
  )
  expect(missing.status()).toBe(404)
})

test('authorized Admin uploads a fictional image through the controlled endpoint', async ({
  page,
}) => {
  await login(page)
  await page.goto(`${cmsUrl}/admin/media-assets`)
  await expect(
    page.getByRole('heading', { name: '上传媒体资产' }),
  ).toBeVisible()
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGNwSGj4D8IMMAYAR7QIfcFCj9gAAAAASUVORK5CYII=',
    'base64',
  )
  await page.locator('#media-file').setInputFiles({
    buffer: png,
    mimeType: 'image/png',
    name: 'fictional-self-made.png',
  })
  const upload = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        '/api/v1/admin/media-assets/upload' &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '上传并生成站点版本' }).click()
  expect((await upload).status()).toBe(201)
  await expect(page.getByText(/上传完成：资产/)).toBeVisible()
})

test('Admin Gallery upload → author preview → draft → publish → replace → republish → unpublish', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const context = await browser.newContext()
  const adminPage = await context.newPage()
  const runId = crypto.randomUUID()
  const targetDisplayName = 'R2 分页候选 051'
  const targetLoginName = 'e2e-gallery-author-051'
  try {
    await login(adminPage)
    const firstMedia = await uploadThroughAdmin(
      adminPage,
      `fictional-first-${runId}.png`,
    )
    const secondMedia = await uploadThroughAdmin(
      adminPage,
      `fictional-second-${runId}.png`,
    )

    await adminPage.goto(`${cmsUrl}/admin/collections/gallery-works/create`)
    const authorSelect = adminPage.locator('select[id^="gallery-author-"]')
    await expect(authorSelect).toBeEnabled()
    await expect(
      authorSelect.locator('option', { hasText: targetDisplayName }),
    ).toHaveCount(0)
    const secondPagePromise = adminPage.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.pathname === '/api/v1/admin/gallery-authors' &&
        url.searchParams.get('page') === '2' &&
        !url.searchParams.has('q')
      )
    })
    await adminPage.getByRole('button', { name: '加载更多作者' }).click()
    const secondPage = await secondPagePromise
    expect(secondPage.ok(), await secondPage.text()).toBe(true)
    await expect(
      authorSelect.locator('option', { hasText: targetDisplayName }),
    ).toHaveCount(1)

    const searchResponsePromise = adminPage.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.pathname === '/api/v1/admin/gallery-authors' &&
        url.searchParams.get('q') === targetDisplayName
      )
    })
    await adminPage.getByLabel('搜索作者显示名').fill(targetDisplayName)
    await adminPage.getByRole('button', { name: '搜索作者' }).click()
    const searchResponse = await searchResponsePromise
    expect(searchResponse.ok(), await searchResponse.text()).toBe(true)
    const searchBody = (await searchResponse.json()) as {
      items: Array<Record<string, unknown>>
    }
    expect(searchBody.items).toHaveLength(1)
    expect(Object.keys(searchBody.items[0]!).sort()).toEqual([
      'displayName',
      'id',
      'statusHint',
    ])
    expect(JSON.stringify(searchBody)).not.toContain(targetLoginName)
    expect(JSON.stringify(searchBody)).not.toContain('studentNumber')
    expect(JSON.stringify(searchBody)).not.toContain('member')
    await expect(adminPage.locator('body')).not.toContainText(targetLoginName)
    let repeatedSearchRequests = 0
    await adminPage.route(
      '**/api/v1/admin/gallery-authors?**',
      async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        if (
          request.method() === 'GET' &&
          url.searchParams.get('q') === targetDisplayName
        ) {
          repeatedSearchRequests += 1
          if (repeatedSearchRequests === 1) {
            await route.fulfill({
              body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE' }),
              contentType: 'application/json',
              status: 503,
            })
            return
          }
        }
        await route.fallback()
      },
    )
    await adminPage.getByRole('button', { name: '搜索作者' }).click()
    await expect(
      adminPage.getByText('作者候选暂时不可用，请稍后重试。'),
    ).toBeVisible()
    const repeatedSearchResponse = adminPage.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        response.request().method() === 'GET' &&
        url.pathname === '/api/v1/admin/gallery-authors' &&
        url.searchParams.get('q') === targetDisplayName &&
        response.status() === 200
      )
    })
    await adminPage.getByRole('button', { name: '搜索作者' }).click()
    await repeatedSearchResponse
    await expect(
      adminPage.getByText('作者候选暂时不可用，请稍后重试。'),
    ).toHaveCount(0)
    expect(repeatedSearchRequests).toBe(2)
    await adminPage.unroute('**/api/v1/admin/gallery-authors?**')
    const author = searchBody.items[0] as { id: string }
    await authorSelect.selectOption(author.id)
    await expect(
      adminPage.getByText(`服务端确认的本次发布署名：${targetDisplayName}`),
    ).toBeVisible()

    await chooseRelationship(adminPage, 'media', firstMedia.id)
    const title = `R2 虚构画廊作品 ${runId}`
    await adminPage.locator('#field-title').fill(title)
    await adminPage
      .locator('#field-altText')
      .fill('虚构浏览器测试图，无真实人物')
    await adminPage.locator('#field-penName').fill('虚构浏览器笔名')
    await expect(
      adminPage.getByText('服务端确认的本次发布署名：虚构浏览器笔名'),
    ).toBeVisible()

    const create = await submitGallery(adminPage, '#action-save-draft', 'POST')
    expect(create.ok(), await create.text()).toBe(true)
    const work = unwrapGalleryDocument(await create.json())
    expect(
      (
        await adminPage.request.get(
          `${cmsUrl}/api/v1/content/gallery/${work.slug}`,
        )
      ).status(),
    ).toBe(404)

    await adminPage.goto(`${cmsUrl}/admin/collections/gallery-works/${work.id}`)
    const invalidPreviewPromise = adminPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/admin/gallery-authors' &&
        response.request().method() === 'POST',
    )
    await adminPage
      .locator('#field-penName')
      .fill(`虚构作者包含 ${targetLoginName}`)
    const invalidPreview = await invalidPreviewPromise
    expect(await invalidPreview.json()).toEqual({ status: 'invalid' })
    await expect(
      adminPage.getByText('当前署名不能发布，请填写安全笔名或更换作者。'),
    ).toBeVisible()
    await adminPage.locator('#field-displayRightsConfirmed').check()
    await chooseRelationship(adminPage, 'recognizablePeople', '无可识别人像')
    const rejectedPublish = await submitGallery(
      adminPage,
      '#action-save',
      'PATCH',
      work.id,
    )
    expect(rejectedPublish.status()).toBe(400)
    await adminPage.locator('#field-penName').fill('虚构浏览器笔名')
    await expect(
      adminPage.getByText('服务端确认的本次发布署名：虚构浏览器笔名'),
    ).toBeVisible()
    const publish = await submitGallery(
      adminPage,
      '#action-save',
      'PATCH',
      work.id,
    )
    expect(publish.ok(), await publish.text()).toBe(true)
    const imagePath = `${cmsUrl}/api/v1/content/gallery/${work.slug}/image/detail`
    const firstImage = await adminPage.request.get(imagePath)
    expect(firstImage.ok()).toBe(true)
    const firstBytes = await firstImage.body()

    await chooseRelationship(adminPage, 'media', secondMedia.id)
    const replacementDraft = await submitGallery(
      adminPage,
      '#action-save-draft',
      'PATCH',
      work.id,
    )
    expect(replacementDraft.ok(), await replacementDraft.text()).toBe(true)
    expect(
      Buffer.compare(
        await (await adminPage.request.get(imagePath)).body(),
        firstBytes,
      ),
    ).toBe(0)

    await adminPage.goto(`${cmsUrl}/admin/collections/gallery-works/${work.id}`)
    await adminPage
      .locator('#field-altText')
      .fill('虚构浏览器替换测试图，无真实人物')
    await adminPage.locator('#field-displayRightsConfirmed').check()
    await chooseRelationship(adminPage, 'recognizablePeople', '无可识别人像')
    const republish = await submitGallery(
      adminPage,
      '#action-save',
      'PATCH',
      work.id,
    )
    expect(republish.ok(), await republish.text()).toBe(true)
    expect(
      Buffer.compare(
        await (await adminPage.request.get(imagePath)).body(),
        firstBytes,
      ),
    ).not.toBe(0)

    const unpublish = await unpublishGallery(adminPage, work.id)
    expect(unpublish.ok(), await unpublish.text()).toBe(true)
    expect(
      (
        await adminPage.request.get(
          `${cmsUrl}/api/v1/content/gallery/${work.slug}`,
        )
      ).status(),
    ).toBe(404)
    expect((await adminPage.request.get(imagePath)).status()).toBe(404)
  } finally {
    await context.close()
  }
})

test('Gallery media navigation and upload enforce the role matrix', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  for (const [username, password, expectedHref] of [
    ['e2e-owner', 'Local-owner-Only-2026!', '/admin/media-assets'],
    ['e2e-admin', 'Local-admin-Only-2026!', '/admin/media-assets'],
    ['e2e-staff', 'Local-staff-Only-2026!', '/admin/media-assets'],
    [
      'e2e-deny-staff',
      'Local-deny-staff-Only-2026!',
      '/admin/collections/media-assets',
    ],
  ] as const) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await login(page, username, password)
    const mediaLink = page.getByRole('link', { name: /媒体资产/ }).first()
    await expect(mediaLink).toHaveAttribute('href', expectedHref)
    if (username === 'e2e-staff') {
      const ownAuthors = await page.request.get(
        `${cmsUrl}/api/v1/admin/gallery-authors?page=2&q=R2%20分页候选%20051`,
      )
      expect(ownAuthors.ok(), await ownAuthors.text()).toBe(true)
      expect(await ownAuthors.json()).toMatchObject({
        hasNextPage: false,
        items: [
          {
            displayName: 'staff E2E user',
            statusHint: 'ready',
          },
        ],
        page: 1,
      })
    }
    await context.close()
  }

  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  await login(memberPage, 'e2e-member', 'Local-member-Only-2026!')
  await expect(memberPage.getByRole('link', { name: /媒体资产/ })).toHaveCount(
    0,
  )
  expect(
    (
      await memberPage.request.post(
        `${cmsUrl}/api/v1/admin/media-assets/upload`,
        {
          data: Buffer.from([0xff, 0xd8, 0xff]),
          headers: { 'content-type': 'image/jpeg' },
        },
      )
    ).status(),
  ).toBe(403)
  await memberContext.close()

  const anonymous = await request.newContext({ baseURL: cmsUrl })
  expect(
    (
      await anonymous.post('/api/v1/admin/media-assets/upload', {
        data: Buffer.from([0xff, 0xd8, 0xff]),
        headers: { 'content-type': 'image/jpeg' },
      })
    ).status(),
  ).toBe(401)
  await anonymous.dispose()
})

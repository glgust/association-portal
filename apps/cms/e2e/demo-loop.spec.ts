import { expect, request, test } from '@playwright/test'

const cmsUrl = process.env.PLAYWRIGHT_CMS_SERVER_URL ?? 'http://127.0.0.1:3201'

async function login(username: string, password: string) {
  const context = await request.newContext({ baseURL: cmsUrl })
  const response = await context.post('/api/auth-users/login', {
    data: { password, username },
  })
  expect(response.ok()).toBe(true)
  const body = (await response.json()) as { token: string }
  return { context, token: body.token }
}

test('dynamic submit → forbidden staff review → cadre approval → shared Admin shell', async ({
  browser,
  page,
}) => {
  const cadre = await login('e2e-cadre', 'Local-cadre-Only-2026!')
  const cyclesResponse = await cadre.context.get(
    '/api/recruitment-cycles?where[code][equals]=demo-2026-m001',
    { headers: { Authorization: `JWT ${cadre.token}` } },
  )
  const cycles = (await cyclesResponse.json()) as {
    docs: Array<{ id: string }>
  }
  const cycleId = cycles.docs[0]?.id
  expect(cycleId).toBeTruthy()

  await page.goto(`/join/${cycleId}`)
  await page.getByLabel(/姓名/).fill('Playwright 测试同学')
  await page.getByLabel('学号 *').fill(`E2E-${crypto.randomUUID()}`)
  await page.getByRole('button', { name: '提交预报名' }).click()
  const success = page.getByText(/提交成功，申请编号：/)
  await expect(success).toBeVisible()
  const applicationId = (await success.textContent())?.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  )?.[0]
  expect(applicationId).toBeTruthy()

  const staff = await login('e2e-staff', 'Local-staff-Only-2026!')
  const forbidden = await staff.context.post(
    `/api/v1/admin/applications/${applicationId}/approve`,
    {
      data: { expectedVersion: 1 },
      headers: { Authorization: `JWT ${staff.token}` },
    },
  )
  expect(forbidden.status()).toBe(403)
  expect((await forbidden.json()).code).toBe('FORBIDDEN')

  const approved = await cadre.context.post(
    `/api/v1/admin/applications/${applicationId}/approve`,
    {
      data: { expectedVersion: 1 },
      headers: { Authorization: `JWT ${cadre.token}` },
    },
  )
  expect(approved.ok()).toBe(true)
  expect((await approved.json()).status).toBe('approved')

  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  const browserLogin = await adminPage.request.post(
    `${cmsUrl}/api/auth-users/login`,
    {
      data: { password: 'Local-cadre-Only-2026!', username: 'e2e-cadre' },
    },
  )
  expect(browserLogin.ok()).toBe(true)
  await adminPage.goto(`${cmsUrl}/admin/recruitment-review`)
  await expect(
    adminPage.getByRole('heading', { name: '入会申请审核 Demo' }),
  ).toBeVisible()
  await adminPage.goto(`${cmsUrl}/admin/collections/demo-pages`)
  await expect(adminPage.getByText('Demo 页面').first()).toBeVisible()

  await Promise.all([
    staff.context.dispose(),
    cadre.context.dispose(),
    adminContext.close(),
  ])
})

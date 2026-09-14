import 'dotenv/config'

import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'

import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { getPayload } from 'payload'

import config from '../src/payload.config'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const databaseUrl = new URL(required('DATABASE_URL'))
if (
  databaseUrl.pathname !== '/ascnucc_demo_dev' ||
  !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
) {
  throw new Error(
    'Local acceptance may only use the local ascnucc_demo_dev database',
  )
}

const cmsUrl = 'http://127.0.0.1:3001'
const webUrl = 'http://127.0.0.1:3000'
const payload = await getPayload({ config })
const cycle = (
  await payload.find({
    collection: 'recruitment-cycles',
    limit: 1,
    overrideAccess: true,
    where: { code: { equals: 'local-demo-recruitment' } },
  })
).docs[0]
if (!cycle) throw new Error('Run the local Demo seed before acceptance')

const initialPending = await payload.count({
  collection: 'membership-applications',
  overrideAccess: true,
  where: { status: { equals: 'pending' } },
})

const blockingBrowserErrors: Array<{ message: string; page: string }> = []

function observeBlockingErrors(page: Page, name: string) {
  page.on('pageerror', (error) => {
    blockingBrowserErrors.push({ message: error.message, page: name })
  })
  page.on('requestfailed', (request) => {
    blockingBrowserErrors.push({
      message: `${request.failure()?.errorText ?? 'request failed'}: ${request.url()}`,
      page: name,
    })
  })
  page.on('response', (response) => {
    if (response.status() >= 500) {
      blockingBrowserErrors.push({
        message: `HTTP ${response.status()}: ${response.url()}`,
        page: name,
      })
    }
  })
}

async function login(
  context: BrowserContext,
  username: string,
  password: string,
  pageName: string,
) {
  const page = await context.newPage()
  observeBlockingErrors(page, pageName)
  await page.goto(`${cmsUrl}/admin`, { waitUntil: 'networkidle' })
  const usernameInput = page.locator('input[name="username"]')
  const passwordInput = page.locator('input[name="password"]')
  const submit = page.locator('button[type="submit"]')
  assert.equal(await usernameInput.count(), 1)
  assert.equal(await passwordInput.count(), 1)
  assert.equal(await submit.count(), 1)
  await usernameInput.fill(username)
  await passwordInput.fill(password)
  await submit.click()
  await page.waitForURL(`${cmsUrl}/admin`, { timeout: 30_000 })
  return page
}

const browser = await chromium.launch({
  args: ['--no-proxy-server'],
  channel:
    (process.env.PLAYWRIGHT_CHANNEL as 'chrome' | 'msedge' | undefined) ??
    'msedge',
  headless: true,
})

let applicationId = ''
try {
  const ownerContext = await browser.newContext()
  const ownerPage = await login(
    ownerContext,
    required('DEMO_ADMIN_USERNAME'),
    required('DEMO_ADMIN_PASSWORD'),
    'owner-admin',
  )
  await ownerPage.goto(`${cmsUrl}/admin/collections/demo-pages`, {
    waitUntil: 'networkidle',
  })
  assert.match(await ownerPage.locator('body').innerText(), /Demo Pages/)
  await ownerPage.goto(`${cmsUrl}/admin/recruitment-review`, {
    waitUntil: 'networkidle',
  })
  assert.match(await ownerPage.locator('body').innerText(), /入会申请审核 Demo/)
  if (initialPending.totalDocs === 0) {
    assert.match(
      await ownerPage.locator('body').innerText(),
      /当前没有待处理申请/,
    )
  }
  await ownerContext.close()

  const visitorContext = await browser.newContext()
  const visitorPage = await visitorContext.newPage()
  observeBlockingErrors(visitorPage, 'visitor-application')
  await visitorPage.goto(`${webUrl}/join/${cycle.id}`, {
    waitUntil: 'networkidle',
  })
  await visitorPage.getByLabel('姓名 *').fill('本地验收测试同学')
  await visitorPage.getByLabel('学号 *').fill(`LOCAL-DEMO-${randomUUID()}`)
  await visitorPage.getByLabel('兴趣方向').selectOption('observing')
  await visitorPage
    .getByLabel('虚构的个人介绍')
    .fill('完全虚构的本地验收数据。')
  await visitorPage.getByRole('button', { name: '提交预报名' }).click()
  const success = visitorPage.getByText(/提交成功，申请编号：/)
  await success.waitFor({ state: 'visible', timeout: 30_000 })
  applicationId =
    (await success.textContent())?.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    )?.[0] ?? ''
  assert.ok(applicationId, 'Application ID was not rendered after submission')
  await visitorContext.close()

  const staffContext = await browser.newContext()
  const staffPage = await login(
    staffContext,
    required('DEMO_STAFF_USERNAME'),
    required('DEMO_STAFF_PASSWORD'),
    'staff-review',
  )
  await staffPage.goto(`${cmsUrl}/admin/recruitment-review`, {
    waitUntil: 'networkidle',
  })
  const staffArticle = staffPage.locator('article', {
    hasText: applicationId,
  })
  assert.equal(await staffArticle.count(), 1)
  assert.equal(
    await staffArticle.getByRole('button', { name: '审核通过' }).count(),
    0,
  )
  assert.match(await staffArticle.innerText(), /当前账号没有审核权限/)
  const forbidden = await staffPage.request.post(
    `${cmsUrl}/api/v1/admin/applications/${applicationId}/approve`,
    { data: { expectedVersion: 1 } },
  )
  assert.equal(forbidden.status(), 403)
  await staffContext.close()

  const cadreContext = await browser.newContext()
  const cadrePage = await login(
    cadreContext,
    required('DEMO_CADRE_USERNAME'),
    required('DEMO_CADRE_PASSWORD'),
    'cadre-review',
  )
  await cadrePage.goto(`${cmsUrl}/admin/recruitment-review`, {
    waitUntil: 'networkidle',
  })
  const cadreArticle = cadrePage.locator('article', {
    hasText: applicationId,
  })
  assert.equal(await cadreArticle.count(), 1)
  const approve = cadreArticle.getByRole('button', { name: '审核通过' })
  assert.equal(await approve.count(), 1)
  await approve.click()
  await cadreArticle
    .getByText('已通过；刷新页面可查看最新队列。')
    .waitFor({ state: 'visible', timeout: 30_000 })
  await cadreContext.close()
} finally {
  await browser.close()
}

assert.equal(
  blockingBrowserErrors.length,
  0,
  JSON.stringify(blockingBrowserErrors),
)

const [application, members, reviews, audits] = await Promise.all([
  payload.findByID({
    collection: 'membership-applications',
    id: applicationId,
    overrideAccess: true,
  }),
  payload.count({
    collection: 'members',
    overrideAccess: true,
    where: { sourceApplication: { equals: applicationId } },
  }),
  payload.count({
    collection: 'review-actions',
    overrideAccess: true,
    where: { application: { equals: applicationId } },
  }),
  payload.count({
    collection: 'audit-events',
    overrideAccess: true,
    where: {
      and: [
        { action: { equals: 'recruitment.application.approved' } },
        { targetId: { equals: applicationId } },
      ],
    },
  }),
])

assert.equal(application.status, 'approved')
assert.equal(members.totalDocs, 1)
assert.equal(reviews.totalDocs, 1)
assert.equal(audits.totalDocs, 1)

payload.logger.info(
  `Local acceptance passed; cycleId=${cycle.id}; applicationId=${applicationId}; staff=403; artifacts=1/1/1`,
)
process.exit(0)

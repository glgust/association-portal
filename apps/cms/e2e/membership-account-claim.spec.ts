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
const webUrl = 'http://127.0.0.1:3100'
const ownerLoginName = 'e2e-owner'
const ownerPassword = 'Local-owner-Only-2026!'

test.use({ trace: 'off' })

type LoginResult = { context: APIRequestContext; token: string }
type QueueItem = {
  accountId: null | string
  id: string
  kind: 'claim' | 'intake'
  recordVersion: number
  status: 'approved' | 'pendingReview' | 'rejected'
}
type ClaimDetail = {
  accountId: string
  accountRecordVersion: number
  id: string
  recordVersion: number
  status: 'approved' | 'pendingReview' | 'rejected'
}
type ProcessedQueueItem = {
  id: string
  productStatus: string
}

async function loginApi(
  username: string,
  password: string,
): Promise<LoginResult> {
  const context = await request.newContext({ baseURL: cmsUrl })
  const response = await context.post('/api/auth-users/login', {
    data: { password, username },
  })
  expect(response.ok(), await response.text()).toBe(true)
  return {
    context,
    token: ((await response.json()) as { token: string }).token,
  }
}

async function loginThroughAdmin(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto(`${cmsUrl}/admin`)
  await page.locator('#field-username').fill(username)
  await page.locator('#field-password').fill(password)
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth-users/login' &&
      response.request().method() === 'POST',
  )
  await page
    .getByRole('button', { exact: true, name: /^(Login|登录)$/ })
    .click()
  expect((await responsePromise).ok()).toBe(true)
}

function expectNoStore(response: { headers(): Record<string, string> }): void {
  expect(response.headers()['cache-control']).toContain('no-store')
}

function expectNoPrivateFields(text: string, secrets: string[]): void {
  expect(
    /"(?:hash|salt|password|passwordConfirmation|sessions?|token)"\s*:/.test(
      text,
    ),
  ).toBe(false)
  for (const secret of secrets) expect(text).not.toContain(secret)
}

async function expectNotPersisted(
  page: Page,
  secrets: string[],
): Promise<void> {
  const persisted = await page.evaluate(() => ({
    dataAttributes: Array.from(document.querySelectorAll('*')).flatMap(
      (element) =>
        Array.from(element.attributes)
          .filter((attribute) => attribute.name.startsWith('data-'))
          .map((attribute) => attribute.value),
    ),
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
  }))
  for (const secret of secrets) {
    expect(page.url()).not.toContain(secret)
    expect(persisted.dataAttributes.join('\n')).not.toContain(secret)
    expect(persisted.local).not.toContain(secret)
    expect(persisted.session).not.toContain(secret)
  }
}

async function adminGet<T>(owner: LoginResult, path: string): Promise<T> {
  const response = await owner.context.get(path, {
    headers: { Authorization: `JWT ${owner.token}` },
  })
  expect(response.ok(), await response.text()).toBe(true)
  expectNoStore(response)
  return (await response.json()) as T
}

async function adminPost<T>(
  owner: LoginResult,
  path: string,
  data: object,
): Promise<{ body: T; status: number }> {
  const response = await owner.context.post(path, {
    data,
    headers: { Authorization: `JWT ${owner.token}` },
  })
  expectNoStore(response)
  return { body: (await response.json()) as T, status: response.status() }
}

async function preconfigureMember(
  owner: LoginResult,
  fixture: { contact: string; name: string; studentNumber: string },
): Promise<void> {
  const response = await owner.context.post(
    '/api/v1/admin/member-account-claims/preconfigure',
    {
      data: {
        member: {
          mode: 'create',
          offlineInterviewConfirmed: true,
          profile: {
            contacts: [
              {
                isPrimary: true,
                label: null,
                type: 'wechat',
                value: fixture.contact,
              },
            ],
            major: null,
            membershipIdentity: 'member',
            name: fixture.name,
            source: 'offlineInterview',
            studentNumber: fixture.studentNumber,
          },
        },
        overrides: [],
        role: 'member',
      },
      headers: { Authorization: `JWT ${owner.token}` },
    },
  )
  expect(response.status(), await response.text()).toBe(201)
  expectNoStore(response)
  expect(await response.json()).toEqual({ updated: true })
}

function claimCommand(fixture: {
  contact: string
  name: string
  password: string
  studentNumber: string
}) {
  return {
    contacts: [
      { isPrimary: true, label: null, type: 'wechat', value: fixture.contact },
    ],
    fullName: fixture.name,
    major: null,
    membershipIdentity: 'member',
    password: fixture.password,
    passwordConfirmation: fixture.password,
    studentNumber: fixture.studentNumber,
  }
}

function publicClaimResponse(response: Response): boolean {
  const url = new URL(response.url())
  return (
    url.origin === webUrl &&
    url.pathname === '/api/membership/account-claims' &&
    response.request().method() === 'POST'
  )
}

async function submitPublicClaim(
  context: APIRequestContext,
  fixture: {
    contact: string
    name: string
    password: string
    studentNumber: string
  },
  idempotencyKey = randomUUID(),
) {
  return context.post('/api/membership/account-claims', {
    data: claimCommand(fixture),
    headers: { 'idempotency-key': idempotencyKey },
  })
}

async function submitPublicIntake(
  context: APIRequestContext,
  fixture: { contact: string; name: string; studentNumber: string },
) {
  return context.post('/api/membership/intake-applications', {
    data: {
      contacts: [
        {
          isPrimary: true,
          label: null,
          type: 'wechat',
          value: fixture.contact,
        },
      ],
      fullName: fixture.name,
      major: null,
      membershipIdentity: 'member',
      privacyPurposeAccepted: true,
      studentNumber: fixture.studentNumber,
    },
    headers: { 'idempotency-key': randomUUID() },
  })
}

test('account claim closes through public UI and admin review without leaking secrets', async ({
  browser,
  page,
}) => {
  test.setTimeout(300_000)
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const fixture = {
    contact: `fictional-wechat-${suffix}`,
    name: `虚构认领会员${suffix}`,
    password: `Fictional claim password ${suffix}!`,
    studentNumber: `26${Date.now().toString().slice(-10)}`,
  }
  const owner = await loginApi(ownerLoginName, ownerPassword)
  const consoleMessages: string[] = []
  page.on('console', (message) => consoleMessages.push(message.text()))
  try {
    const before = await adminGet<{ items: QueueItem[] }>(
      owner,
      '/api/v1/admin/member-account-claims',
    )
    await preconfigureMember(owner, fixture)
    const optionsPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
        '/api/membership/account-claim/options',
    )
    await page.goto(`${webUrl}/account/claim`)
    const optionsResponse = await optionsPromise
    expect(optionsResponse.ok()).toBe(true)
    expectNoStore(optionsResponse)
    await expect(page.getByRole('group', { name: '核验路径' })).toBeVisible()
    await expect(page.locator('input[name="membershipIdentity"]')).toHaveCount(
      3,
    )
    await expect(
      page.locator('input[value="admin"], input[value="owner"]'),
    ).toHaveCount(0)
    await expect(
      page.getByText('无后台业务权限', { exact: false }),
    ).toBeVisible()

    await page.setViewportSize({ height: 844, width: 390 })
    await page.getByLabel('姓名').fill(fixture.name)
    await page.getByLabel('学号').fill(fixture.studentNumber)
    await page.getByLabel('联系方式值').fill(fixture.contact)
    await page.getByLabel('正式密码', { exact: true }).fill(fixture.password)
    await page.getByLabel('确认正式密码').fill(fixture.password)
    const submit = page.getByRole('button', { name: '提交账号认领审核' })
    await submit.focus()
    await expect(submit).toBeFocused()
    const claimPromise = page.waitForResponse(publicClaimResponse)
    await page.keyboard.press('Enter')
    const claimResponse = await claimPromise
    expect(claimResponse.ok(), await claimResponse.text()).toBe(true)
    expectNoStore(claimResponse)
    const claimText = await claimResponse.text()
    expectNoPrivateFields(claimText, [fixture.password, fixture.contact])
    const claimResult = JSON.parse(claimText) as {
      outcome: 'pendingReview'
      statusReceipt: string
    }
    expect(claimResult).toMatchObject({ outcome: 'pendingReview' })
    await expect(page.getByRole('status')).toContainText('账号认领已提交审核')
    await expect(page.getByLabel('正式密码', { exact: true })).toHaveValue('')
    await expectNotPersisted(page, [fixture.password, fixture.contact])
    const width = await page.locator('main').evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }))
    expect(width.scroll).toBeLessThanOrEqual(width.client)

    const statusPage = await browser.newPage()
    await statusPage.goto(`${webUrl}/account/claim/status`)
    await statusPage
      .getByLabel('认领进度查询凭证')
      .fill(claimResult.statusReceipt)
    await statusPage.getByRole('button', { name: '查询进度' }).click()
    await expect(statusPage.getByRole('status')).toContainText('等待审核')
    expect(statusPage.url()).not.toContain(claimResult.statusReceipt)

    const after = await adminGet<{ items: QueueItem[] }>(
      owner,
      '/api/v1/admin/member-account-claims',
    )
    const beforeIds = new Set(before.items.map((item) => item.id))
    const claim = after.items.find(
      (item) => item.kind === 'claim' && !beforeIds.has(item.id),
    )
    expect(claim, 'newly submitted claim should be queued').toBeTruthy()

    let currentStatusReceipt = claimResult.statusReceipt
    const ownerContext = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
      viewport: { height: 900, width: 1440 },
    })
    const ownerPage = await ownerContext.newPage()
    try {
      await loginThroughAdmin(ownerPage, ownerLoginName, ownerPassword)
      await ownerPage.goto(`${cmsUrl}/admin/member-account-claims`)
      await expect(
        ownerPage.getByRole('heading', { name: '认领与人工核验队列' }),
      ).toBeVisible()
      const itemIndex = after.items.findIndex((item) => item.id === claim!.id)
      await ownerPage
        .getByRole('region', { name: '待处理项目' })
        .getByRole('button')
        .nth(itemIndex)
        .click()
      await expect(
        ownerPage.getByText(fixture.name, { exact: true }),
      ).toBeVisible()
      await expect(
        ownerPage.getByText('无默认业务权限', { exact: true }),
      ).toBeVisible()
      const approvalPromise = ownerPage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/v1/admin/member-account-claims/claims/${claim!.id}/approve` &&
          response.request().method() === 'POST',
      )
      const approve = ownerPage.getByRole('button', {
        name: '批准认领并激活账号',
        exact: true,
      })
      await approve.focus()
      await ownerPage.keyboard.press('Enter')
      const approvalResponse = await approvalPromise
      expect(approvalResponse.ok(), await approvalResponse.text()).toBe(true)
      expectNoStore(approvalResponse)
      await expect(
        ownerPage.getByText(
          '账号认领已批准，账号已直接生效；用户可用其自行设置的正式密码登录。',
          { exact: true },
        ),
      ).toBeVisible()
      await expect(
        ownerPage.getByRole('region', { name: '已处理与后续操作' }),
      ).toContainText('已批准，可使用正式密码登录')
      await ownerPage
        .getByRole('region', { name: '已处理与后续操作' })
        .getByRole('button')
        .filter({ hasText: '已批准，可使用正式密码登录' })
        .first()
        .click()
      const receiptResponsePromise = ownerPage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith('/status-receipt') &&
          response.request().method() === 'POST',
      )
      await ownerPage.getByRole('button', { name: '重新签发查询凭证' }).click()
      const receiptResponse = await receiptResponsePromise
      expect(receiptResponse.ok(), await receiptResponse.text()).toBe(true)
      const reissued = (await receiptResponse.json()) as {
        statusReceipt: string
        statusReceiptExpiresAt: string
      }
      currentStatusReceipt = reissued.statusReceipt
      const receiptRegion = ownerPage.getByRole('region', {
        name: '一次性查询凭证',
      })
      await expect(receiptRegion).toContainText('仅用于公开认领进度查询')
      await expect(receiptRegion).toContainText(reissued.statusReceiptExpiresAt)
      await expect(receiptRegion).toContainText('有效期仍以原终态处理时间后')
      await receiptRegion.getByRole('button', { name: '复制查询凭证' }).click()
      await expect(receiptRegion).toContainText('查询凭证已复制。')
      await expect
        .poll(() => ownerPage.evaluate(() => navigator.clipboard.readText()))
        .toBe(reissued.statusReceipt)
    } finally {
      await ownerContext.close()
    }

    await statusPage.getByLabel('认领进度查询凭证').fill(currentStatusReceipt)
    await statusPage.getByRole('button', { name: '查询进度' }).click()
    await expect(statusPage.getByRole('status')).toContainText(
      '审核已通过，可使用正式密码登录',
    )
    await statusPage.close()

    const memberContext = await browser.newContext({
      viewport: { height: 844, width: 390 },
    })
    const memberPage = await memberContext.newPage()
    try {
      await loginThroughAdmin(
        memberPage,
        fixture.studentNumber,
        fixture.password,
      )
      await memberPage.waitForURL(`${cmsUrl}/admin`)
      await memberPage.getByRole('link', { name: '进入我的协会账号' }).click()
      await memberPage.waitForURL(`${cmsUrl}/admin/member-account`)
      await expect(
        memberPage.getByRole('heading', { name: `你好，${fixture.name}` }),
      ).toBeVisible()
      await expect(
        memberPage.getByText('当前没有默认后台业务权限。'),
      ).toBeVisible()
      await memberPage.setViewportSize({ height: 900, width: 1440 })
      await memberPage.reload()
      await expect(
        memberPage.getByRole('link', {
          name: /账号管理|认领与人工核验|招新审核/,
        }),
      ).toHaveCount(0)
      expect(
        (
          await memberContext.request.get(`${cmsUrl}/api/v1/admin/accounts`)
        ).status(),
      ).toBe(403)
      await expectNotPersisted(memberPage, [fixture.password, fixture.contact])
    } finally {
      await memberContext.close()
    }
    expect(
      consoleMessages.some((message) =>
        [fixture.password, fixture.contact].some((secret) =>
          message.includes(secret),
        ),
      ),
    ).toBe(false)
  } finally {
    await owner.context.dispose()
  }
})

test('selected claim conversion requires confirmation and becomes login-ready after activation', async ({
  browser,
}) => {
  test.setTimeout(300_000)
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const fixture = {
    contact: `fictional-conversion-${suffix}`,
    name: `虚构转换认领${suffix}`,
    password: `Fictional conversion password ${suffix}!`,
    studentNumber: `38${Date.now().toString().slice(-10)}`,
  }
  const activationPassword = `Fictional activated password ${suffix}!`
  const owner = await loginApi(ownerLoginName, ownerPassword)
  const publicApi = await request.newContext({ baseURL: webUrl })
  const ownerContext = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  try {
    await preconfigureMember(owner, fixture)
    const submittedResponse = await submitPublicClaim(publicApi, fixture)
    expect(submittedResponse.status(), await submittedResponse.text()).toBe(201)
    const submitted = (await submittedResponse.json()) as {
      accountClaimId: string
      statusReceipt: string
    }
    const queue = await adminGet<{ items: QueueItem[] }>(
      owner,
      '/api/v1/admin/member-account-claims',
    )
    const itemIndex = queue.items.findIndex(
      (item) => item.id === submitted.accountClaimId,
    )
    expect(itemIndex).toBeGreaterThanOrEqual(0)

    const ownerPage = await ownerContext.newPage()
    await loginThroughAdmin(ownerPage, ownerLoginName, ownerPassword)
    await ownerPage.goto(`${cmsUrl}/admin/member-account-claims`)
    await ownerPage
      .getByRole('region', { name: '待处理项目' })
      .getByRole('button')
      .nth(itemIndex)
      .click()
    await expect(
      ownerPage.getByRole('button', { name: '批准认领并激活账号' }),
    ).toBeVisible()
    const convert = ownerPage.getByRole('button', {
      name: '终止认领并转换为临时凭证激活',
    })
    await expect(convert).toBeDisabled()
    await expect(
      ownerPage.getByText('申请人设置的正式密码立即失效；'),
    ).toBeVisible()
    await ownerPage.getByLabel('我已核对上述全部影响，确认终止当前认领').check()
    const conversionPromise = ownerPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/convert-to-direct') &&
        response.request().method() === 'POST',
    )
    await convert.click()
    const conversionResponse = await conversionPromise
    expect(conversionResponse.ok(), await conversionResponse.text()).toBe(true)
    const conversion = (await conversionResponse.json()) as {
      temporaryCredential: string
    }
    const credentialRegion = ownerPage.getByRole('region', {
      name: '一次性临时凭证',
    })
    await credentialRegion.getByRole('button', { name: '复制临时凭证' }).click()
    await expect(credentialRegion).toContainText('临时凭证已复制。')
    await expect
      .poll(() => ownerPage.evaluate(() => navigator.clipboard.readText()))
      .toBe(conversion.temporaryCredential)
    await ownerPage.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: () => Promise.reject(new Error('fictional clipboard failure')),
      })
    })
    await credentialRegion.getByRole('button', { name: '复制临时凭证' }).click()
    await expect(credentialRegion).toContainText(
      '临时凭证复制失败，请手动选择并复制。',
    )

    const pendingStatus = await publicApi.post(
      '/api/membership/account-claim/status',
      { data: { statusReceipt: submitted.statusReceipt } },
    )
    expect(await pendingStatus.json()).toMatchObject({
      status: 'temporaryActivationContactAdmin',
    })

    const activationResponse = await publicApi.post(
      `${cmsUrl}/api/v1/auth/activate`,
      {
        data: {
          loginName: fixture.studentNumber,
          newPassword: activationPassword,
          newPasswordConfirmation: activationPassword,
          temporaryCredential: conversion.temporaryCredential,
        },
      },
    )
    expect(activationResponse.ok(), await activationResponse.text()).toBe(true)
    expectNoStore(activationResponse)
    const activeStatus = await publicApi.post(
      '/api/membership/account-claim/status',
      { data: { statusReceipt: submitted.statusReceipt } },
    )
    expect(await activeStatus.json()).toMatchObject({
      status: 'approvedCanLogin',
    })
    const processed = await adminGet<{ processed: ProcessedQueueItem[] }>(
      owner,
      '/api/v1/admin/member-account-claims',
    )
    expect(processed.processed).toContainEqual(
      expect.objectContaining({
        id: submitted.accountClaimId,
        productStatus: '已转换并激活，可以登录',
      }),
    )
    await ownerPage.reload()
    await expect(
      ownerPage.getByRole('region', { name: '已处理与后续操作' }),
    ).toContainText('已转换并激活，可以登录')
    await expectNotPersisted(ownerPage, [conversion.temporaryCredential])
  } finally {
    await Promise.all([
      owner.context.dispose(),
      publicApi.dispose(),
      ownerContext.close(),
    ])
  }
})

test('public failures are uniform and manual intake never sends a password', async ({
  page,
}) => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const numericSuffix = Date.now().toString().slice(-10)
  const password = `Fictional unavailable password ${suffix}!`
  const publicApi = await request.newContext({ baseURL: webUrl })
  try {
    for (const attempt of [
      {
        name: `虚构不存在甲${suffix}`,
        studentNumber: `71${numericSuffix}`,
      },
      {
        name: `虚构不存在乙${suffix}`,
        studentNumber: `72${numericSuffix}`,
      },
    ]) {
      const response = await publicApi.post('/api/membership/account-claims', {
        data: claimCommand({
          contact: `fictional-${suffix}`,
          name: attempt.name,
          password,
          studentNumber: attempt.studentNumber,
        }),
        headers: { 'idempotency-key': randomUUID() },
      })
      expect(response.ok(), await response.text()).toBe(true)
      expectNoStore(response)
      const text = await response.text()
      expectNoPrivateFields(text, [
        password,
        attempt.name,
        attempt.studentNumber,
      ])
      const body = JSON.parse(text) as Record<string, unknown>
      expect(body).toMatchObject({ outcome: 'manualVerificationRequired' })
      expect(Object.keys(body).sort()).toEqual(['outcome', 'requestId'])
    }

    await page.goto(`${webUrl}/account/claim`)
    await page.getByRole('button', { name: /人工核验/ }).click()
    await expect(page.getByLabel('正式密码', { exact: true })).toHaveCount(0)
    await page.getByLabel('姓名').fill(`虚构人工核验${suffix}`)
    await page.getByLabel('学号（可选）').fill(`73${numericSuffix}`)
    await page.getByLabel('联系方式值').fill(`fictional-contact-${suffix}`)
    await page
      .getByLabel(/我已了解：这些资料仅用于协会内部身份核验与联络/)
      .check()
    const intakePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          '/api/membership/intake-applications' &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: '提交人工核验资料' }).click()
    const intakeResponse = await intakePromise
    expect(intakeResponse.ok(), await intakeResponse.text()).toBe(true)
    expectNoStore(intakeResponse)
    expect(intakeResponse.request().postData() ?? '').not.toMatch(/password/i)
    const intakeText = await intakeResponse.text()
    expectNoPrivateFields(intakeText, [password, `fictional-contact-${suffix}`])
    const intakeResult = JSON.parse(intakeText) as {
      statusReceipt: string
    }
    const statusResponse = await publicApi.post(
      '/api/membership/account-claim/status',
      { data: { statusReceipt: intakeResult.statusReceipt } },
    )
    expect(statusResponse.ok(), await statusResponse.text()).toBe(true)
    expect(await statusResponse.json()).toMatchObject({
      status: 'pendingReview',
    })
    await expect(page.getByRole('status')).toContainText('人工核验资料已提交')
  } finally {
    await publicApi.dispose()
  }
})

test('same Idempotency-Key concurrent submissions replay one durable claim', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const fixture = {
    contact: `fictional-concurrent-${suffix}`,
    name: `虚构并发认领${suffix}`,
    password: `Fictional concurrent password ${suffix}!`,
    studentNumber: `46${Date.now().toString().slice(-10)}`,
  }
  const owner = await loginApi(ownerLoginName, ownerPassword)
  const publicApi = await request.newContext({ baseURL: webUrl })
  try {
    const before = await adminGet<{ items: QueueItem[] }>(
      owner,
      '/api/v1/admin/member-account-claims',
    )
    await preconfigureMember(owner, fixture)
    const key = randomUUID()
    const responses = await Promise.all([
      submitPublicClaim(publicApi, fixture, key),
      submitPublicClaim(publicApi, fixture, key),
    ])
    for (const response of responses) {
      expect(response.status(), await response.text()).toBe(201)
      expectNoStore(response)
    }
    const bodies = await Promise.all(
      responses.map((response) => response.json() as Promise<unknown>),
    )
    expect(bodies[0]).toEqual(bodies[1])
    const after = await adminGet<{ items: QueueItem[] }>(
      owner,
      '/api/v1/admin/member-account-claims',
    )
    const beforeIds = new Set(before.items.map((item) => item.id))
    expect(
      after.items.filter(
        (item) => item.kind === 'claim' && !beforeIds.has(item.id),
      ),
    ).toHaveLength(1)
  } finally {
    await Promise.all([owner.context.dispose(), publicApi.dispose()])
  }
})

test('manual verification shows evidence, clears consecutive selection, and approves', async ({
  page,
}) => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const fixtures = [1, 2].map((index) => ({
    contact: `fictional-intake-${index}-${suffix}`,
    name: `虚构人工核验${index}-${suffix}`,
    studentNumber: `5${index}${Date.now().toString().slice(-10)}`,
  }))
  const owner = await loginApi(ownerLoginName, ownerPassword)
  const publicApi = await request.newContext({ baseURL: webUrl })
  try {
    const before = await adminGet<{ items: QueueItem[] }>(
      owner,
      '/api/v1/admin/member-account-claims',
    )
    for (const fixture of fixtures) {
      const response = await submitPublicIntake(publicApi, fixture)
      expect(response.status(), await response.text()).toBe(201)
      expectNoStore(response)
    }
    const after = await adminGet<{ items: QueueItem[] }>(
      owner,
      '/api/v1/admin/member-account-claims',
    )
    const beforeIds = new Set(before.items.map((item) => item.id))
    const created = after.items.filter(
      (item) => item.kind === 'intake' && !beforeIds.has(item.id),
    )
    expect(created).toHaveLength(2)

    await loginThroughAdmin(page, ownerLoginName, ownerPassword)
    await page.goto(`${cmsUrl}/admin/member-account-claims`)
    const queue = page.getByRole('region', { name: '待处理项目' })
    const firstIndex = after.items.findIndex(
      (item) => item.id === created[0]!.id,
    )
    const secondIndex = after.items.findIndex(
      (item) => item.id === created[1]!.id,
    )
    await queue.getByRole('button').nth(firstIndex).click()
    await expect(
      page.getByText(fixtures[0]!.name, { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(fixtures[0]!.studentNumber, { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(fixtures[0]!.contact, { exact: false }),
    ).toBeVisible()
    await page.getByLabel('既有 Member ID（留空则新建）').fill(randomUUID())
    await page.getByLabel('关联既有 Member 时采用本次申请资料').check()

    await queue.getByRole('button').nth(secondIndex).click()
    await expect(
      page.getByText(fixtures[1]!.name, { exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('既有 Member ID（留空则新建）')).toHaveValue(
      '',
    )
    await expect(
      page.getByLabel('关联既有 Member 时采用本次申请资料'),
    ).not.toBeChecked()
    const approvalPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/v1/admin/member-account-claims/intake-applications/${created[1]!.id}/approve` &&
        response.request().method() === 'POST',
    )
    await page
      .getByRole('button', { name: '批准人工核验', exact: true })
      .click()
    const approvalResponse = await approvalPromise
    expect(approvalResponse.ok(), await approvalResponse.text()).toBe(true)
    await expect(
      page.getByText(
        '人工核验已批准并完成 Member 处理；本操作没有隐式创建 AuthUser。需要账号时请另行预配置或直接建号。',
        { exact: true },
      ),
    ).toBeVisible()
  } finally {
    await Promise.all([owner.context.dispose(), publicApi.dispose()])
  }
})

test('rejected claim can be reopened, resubmitted with a new password, and approved', async ({
  page,
}) => {
  test.setTimeout(300_000)
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const fixture = {
    contact: `fictional-reopen-${suffix}`,
    name: `虚构重新开放${suffix}`,
    password: `Fictional rejected password ${suffix}!`,
    studentNumber: `64${Date.now().toString().slice(-10)}`,
  }
  const replacementPassword = `Fictional reopened password ${suffix}!`
  const owner = await loginApi(ownerLoginName, ownerPassword)
  const publicApi = await request.newContext({ baseURL: webUrl })
  try {
    await preconfigureMember(owner, fixture)
    const submittedResponse = await submitPublicClaim(publicApi, fixture)
    expect(submittedResponse.status(), await submittedResponse.text()).toBe(201)
    const submitted = (await submittedResponse.json()) as {
      accountClaimId: string
    }
    const detail = await adminGet<ClaimDetail>(
      owner,
      `/api/v1/admin/member-account-claims/claims/${submitted.accountClaimId}`,
    )
    const rejection = await adminPost<{ updated: true }>(
      owner,
      `/api/v1/admin/member-account-claims/claims/${detail.id}/reject`,
      {
        expectedAccountVersion: detail.accountRecordVersion,
        expectedClaimVersion: detail.recordVersion,
        reason: 'insufficientEvidence',
      },
    )
    expect(rejection.status).toBe(200)

    const queue = await adminGet<{ items: QueueItem[] }>(
      owner,
      '/api/v1/admin/member-account-claims',
    )
    const rejectedIndex = queue.items.findIndex(
      (item) => item.id === detail.id && item.status === 'rejected',
    )
    expect(rejectedIndex).toBeGreaterThanOrEqual(0)
    await loginThroughAdmin(page, ownerLoginName, ownerPassword)
    await page.goto(`${cmsUrl}/admin/member-account-claims`)
    await page
      .getByRole('region', { name: '待处理项目' })
      .getByRole('button')
      .nth(rejectedIndex)
      .click()
    const reopenPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/v1/admin/member-account-claims/accounts/${detail.accountId}/reopen` &&
        response.request().method() === 'POST',
    )
    await page
      .getByRole('button', { exact: true, name: '重新开放认领' })
      .click()
    const reopenResponse = await reopenPromise
    expect(reopenResponse.ok(), await reopenResponse.text()).toBe(true)

    const reopenedFixture = { ...fixture, password: replacementPassword }
    const resubmittedResponse = await submitPublicClaim(
      publicApi,
      reopenedFixture,
    )
    expect(resubmittedResponse.status(), await resubmittedResponse.text()).toBe(
      201,
    )
    const resubmitted = (await resubmittedResponse.json()) as {
      accountClaimId: string
    }
    const reopenedDetail = await adminGet<ClaimDetail>(
      owner,
      `/api/v1/admin/member-account-claims/claims/${resubmitted.accountClaimId}`,
    )
    const approval = await adminPost<{ updated: true }>(
      owner,
      `/api/v1/admin/member-account-claims/claims/${reopenedDetail.id}/approve`,
      {
        confirmCurrentAuthorization: false,
        expectedAccountVersion: reopenedDetail.accountRecordVersion,
        expectedClaimVersion: reopenedDetail.recordVersion,
      },
    )
    expect(approval.status).toBe(200)

    const oldLogin = await publicApi.post(`${cmsUrl}/api/auth-users/login`, {
      data: { password: fixture.password, username: fixture.studentNumber },
    })
    expect(oldLogin.status()).toBe(401)
    const newLogin = await publicApi.post(`${cmsUrl}/api/auth-users/login`, {
      data: {
        password: replacementPassword,
        username: fixture.studentNumber,
      },
    })
    expect(newLogin.ok(), await newLogin.text()).toBe(true)
  } finally {
    await Promise.all([owner.context.dispose(), publicApi.dispose()])
  }
})

test('unauthorized account receives an explicit forbidden management page state', async ({
  page,
}) => {
  await loginThroughAdmin(page, 'e2e-staff', 'Local-staff-Only-2026!')
  await page.goto(`${cmsUrl}/admin/member-account-claims`)
  await expect(page.getByText('你没有访问此管理页面的权限。')).toBeVisible()
  const queueResponse = await page
    .context()
    .request.get(`${cmsUrl}/api/v1/admin/member-account-claims`)
  expect(queueResponse.status()).toBe(403)
})

test('owner direct-create remains independent of account claims', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const owner = await loginApi(ownerLoginName, ownerPassword)
  try {
    const response = await owner.context.post('/api/v1/admin/accounts', {
      data: {
        accountType: 'external',
        displayName: `虚构直接建号${suffix}`,
        loginName: `direct-${suffix}`,
        reason: '虚构 E2E direct-create 回归',
        role: 'staff',
        studentNumber: null,
      },
      headers: { Authorization: `JWT ${owner.token}` },
    })
    expect(response.status(), await response.text()).toBe(201)
    expectNoStore(response)
    const body = (await response.json()) as {
      account: { status: string }
      temporaryCredential: string
    }
    expect(body.account.status).toBe('pendingActivation')
    expect(body.temporaryCredential).toBeTruthy()
  } finally {
    await owner.context.dispose()
  }
})

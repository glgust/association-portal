import {
  expect,
  request,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type Response,
} from '@playwright/test'
import { randomUUID } from 'node:crypto'

const cmsUrl = process.env.PLAYWRIGHT_CMS_SERVER_URL ?? 'http://127.0.0.1:3201'
const ownerLoginName = 'e2e-owner'
const ownerPassword = 'Local-owner-Only-2026!'

test.use({ trace: 'off' })

type LoginResult = {
  context: APIRequestContext
  token: string
  user: { id: string; recordVersion: number }
}

type TemporaryCredentialResult = {
  account: {
    id: string
    loginName: string
    recordVersion: number
    role: 'admin' | 'cadre' | 'owner' | 'staff'
    status: 'active' | 'disabled' | 'pendingActivation'
  }
  temporaryCredential: string
  temporaryCredentialExpiresAt: string
}

type BrowserEvidence = {
  consoleMessages: string[]
  pageErrors: string[]
}

function monitorPage(page: Page): BrowserEvidence {
  const evidence: BrowserEvidence = { consoleMessages: [], pageErrors: [] }
  page.on('console', (message) => evidence.consoleMessages.push(message.text()))
  page.on('pageerror', (error) => evidence.pageErrors.push(error.message))
  return evidence
}

async function loginApi(
  username: string,
  password: string,
): Promise<LoginResult> {
  const context = await request.newContext({ baseURL: cmsUrl })
  const response = await context.post('/api/auth-users/login', {
    data: { password, username },
  })
  expect(response.ok(), 'API login should succeed').toBe(true)
  const result = (await response.json()) as {
    token: string
    user: { id: string; recordVersion: number }
  }
  return { context, token: result.token, user: result.user }
}

async function loginThroughAdmin(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto(`${cmsUrl}/admin`)
  await page.locator('#field-username').fill(username)
  await page.locator('#field-password').fill(password)
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      url.origin === cmsUrl &&
      url.pathname === '/api/auth-users/login' &&
      response.request().method() === 'POST'
    )
  })
  await page
    .getByRole('button', { exact: true, name: /^(Login|登录)$/ })
    .click()
  const response = await responsePromise
  expect(response.ok(), 'admin login should succeed').toBe(true)
  await expect(page).toHaveURL(/\/admin(?:\/|$)/)
}

function expectNoStore(response: { headers(): Record<string, string> }): void {
  expect(response.headers()['cache-control']).toContain('no-store')
}

async function expectAstralPasswordValidation(
  page: Page,
  loginName: string,
  temporaryCredential: string,
): Promise<void> {
  await page.goto(`${cmsUrl}/admin`)
  const activation = page.getByRole('region', {
    name: '首次激活或重置后设置密码',
  })
  const shortAstralPassword = '😀'.repeat(11)
  await activation.getByLabel('登录名', { exact: true }).fill(loginName)
  await activation
    .getByLabel('临时凭证', { exact: true })
    .fill(temporaryCredential)
  await activation
    .getByLabel('正式密码（12–128 字符）')
    .fill(shortAstralPassword)
  await activation.getByLabel('确认正式密码').fill(shortAstralPassword)
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/auth/activate',
  )
  const submit = activation.getByRole('button', { name: '激活账号' })
  await submit.focus()
  await page.keyboard.press('Enter')
  const response = await responsePromise
  expect(response.status()).toBe(400)
  const body = (await response.json()) as {
    code?: string
    details?: { issues?: Array<{ path?: Array<string> }> }
  }
  expect(body.code).toBe('VALIDATION_FAILED')
  expect(body.details?.issues?.[0]?.path).toEqual(['newPassword'])
  const loginNameInput = activation.getByLabel('登录名', { exact: true })
  const passwordInput = activation.getByLabel('正式密码（12–128 字符）')
  await expect(loginNameInput).not.toHaveAttribute('aria-invalid')
  await expect(loginNameInput).not.toHaveAttribute('aria-describedby')
  await expect(passwordInput).toHaveAttribute('aria-invalid', 'true')
  await expect(passwordInput).toHaveAttribute(
    'aria-describedby',
    'activation-password-error',
  )
  await expect(activation.locator('#activation-password-error')).toBeVisible()
  await expect(activation.getByRole('status')).toHaveText(
    '请检查密码长度（12–128 字符）和确认值。',
  )
}

async function activate(
  page: Page,
  loginName: string,
  temporaryCredential: string,
  password: string,
): Promise<void> {
  await page.goto(`${cmsUrl}/admin`)
  const activation = page.getByRole('region', {
    name: '首次激活或重置后设置密码',
  })
  await expect(activation).toBeVisible()
  await activation.getByLabel('登录名', { exact: true }).fill(loginName)
  await activation
    .getByLabel('临时凭证', { exact: true })
    .fill(temporaryCredential)
  await activation.getByLabel('正式密码（12–128 字符）').fill(password)
  await activation.getByLabel('确认正式密码').fill(password)
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      url.origin === cmsUrl &&
      url.pathname === '/api/v1/auth/activate' &&
      response.request().method() === 'POST'
    )
  })
  const submit = activation.getByRole('button', { name: '激活账号' })
  await submit.focus()
  await expect(submit).toBeFocused()
  await page.keyboard.press('Enter')
  const response = await responsePromise
  expect(response.ok()).toBe(true)
  expectNoStore(response)
  await expect(activation.getByRole('status')).toHaveText(
    '激活成功。请使用正式密码在上方重新登录。',
  )
  await expect(activation.getByLabel('临时凭证', { exact: true })).toHaveValue(
    '',
  )
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
  const leaked = secrets.some(
    (secret) =>
      page.url().includes(secret) ||
      persisted.dataAttributes.some((value) => value.includes(secret)) ||
      persisted.local.includes(secret) ||
      persisted.session.includes(secret),
  )
  expect(leaked, 'secret must not persist in URL or browser storage').toBe(
    false,
  )
}

async function expectStaffSessionState(
  context: BrowserContext,
  expectedStatus: 401 | 403,
): Promise<void> {
  const response = await context.request.get(`${cmsUrl}/api/v1/admin/accounts`)
  const body = (await response.json()) as { code?: string }
  expect(response.status(), JSON.stringify(body)).toBe(expectedStatus)
  expect(body).toMatchObject({
    code: expectedStatus === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
  })
}

async function assertLoginFirstTokenRevoked(
  api: APIRequestContext,
  response: Awaited<ReturnType<APIRequestContext['post']>>,
): Promise<'login-first-token-revoked'> {
  const text = await response.text()
  const leakedMarker =
    text.includes('M009_AUTH_USER_STALE_WRITE') ||
    text.includes('record_version')
  expect(leakedMarker, 'race response must hide database internals').toBe(false)
  expect(response.status()).toBe(200)
  expect(/"(?:hash|salt)"\s*:/.test(text)).toBe(false)
  const body = JSON.parse(text) as { token?: string }
  expect(body.token).toBeTruthy()
  const authenticated = await api.get('/api/auth-users/me', {
    headers: { Authorization: `JWT ${body.token}` },
  })
  const authenticatedText = await authenticated.text()
  expect([200, 401]).toContain(authenticated.status())
  if (authenticated.status() === 200) {
    expect(JSON.parse(authenticatedText)).toEqual({
      message: expect.stringMatching(/^(Account|账号)$/),
      user: null,
    })
  }
  return 'login-first-token-revoked'
}

async function assertTerminalFirstLoginRejected(
  response: Awaited<ReturnType<APIRequestContext['post']>>,
): Promise<void> {
  const text = await response.text()
  expect(response.status()).toBe(401)
  expect(
    text.includes('M009_AUTH_USER_STALE_WRITE') ||
      text.includes('record_version') ||
      /"(?:hash|salt|sessions?|token|user)"\s*:/.test(text),
    'terminal-first login rejection must hide identity and database internals',
  ).toBe(false)
}

function isAccountAction(
  response: Response,
  accountId: string,
  action: 'disable' | 'reenable' | 'reset',
): boolean {
  const url = new URL(response.url())
  return (
    url.origin === cmsUrl &&
    url.pathname === `/api/v1/admin/accounts/${accountId}/${action}` &&
    response.request().method() === 'POST'
  )
}

test('owner creates and activates a staff account, while reset and disable revoke old sessions', async ({
  browser,
}) => {
  test.setTimeout(300_000)
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const loginName = `e2e-${suffix}`
  const displayName = `虚构浏览器账号 ${suffix}`
  const firstPassword = `Fictional first passphrase ${suffix}!`
  const secondPassword = `Fictional second passphrase ${suffix}!`
  const thirdPassword = `Fictional third passphrase ${suffix}!`
  const secrets: string[] = [
    ownerPassword,
    'Local-admin-Only-2026!',
    firstPassword,
    secondPassword,
    thirdPassword,
  ]
  const evidence: BrowserEvidence[] = []
  const ownerContext = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { height: 900, width: 1440 },
  })
  const ownerPage = await ownerContext.newPage()
  evidence.push(monitorPage(ownerPage))
  const owner = await loginApi(ownerLoginName, ownerPassword)
  const cadre = await loginApi('e2e-cadre', 'Local-cadre-Only-2026!')
  const raceApi = await request.newContext({ baseURL: cmsUrl })
  const adminContext = await browser.newContext({
    viewport: { height: 900, width: 1440 },
  })
  const adminPage = await adminContext.newPage()
  evidence.push(monitorPage(adminPage))
  let staffContext: BrowserContext | undefined
  let resetContext: BrowserContext | undefined

  try {
    await loginThroughAdmin(ownerPage, ownerLoginName, ownerPassword)
    await ownerPage.goto(`${cmsUrl}/admin/accounts`)
    await expect(
      ownerPage.getByRole('heading', { name: '后台账号与权限' }),
    ).toBeVisible()

    const accountList = ownerPage.getByRole('complementary', { name: '账号' })
    await expect(
      accountList.getByText(ownerLoginName, { exact: true }),
    ).toHaveCount(0)

    const createForm = ownerPage
      .getByRole('heading', { name: '创建单个账号' })
      .locator('..')
      .locator('form')
    await createForm.getByLabel('账号类型').selectOption('external')
    await createForm.getByLabel('登录名', { exact: true }).fill(loginName)
    await createForm.getByLabel('显示名', { exact: true }).fill(displayName)
    await createForm.getByLabel('创建原因').fill('虚构 E2E 创建验收')
    const createResponsePromise = ownerPage.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.origin === cmsUrl &&
        url.pathname === '/api/v1/admin/accounts' &&
        response.request().method() === 'POST'
      )
    })
    await createForm.getByRole('button', { name: '创建并签发凭证' }).click()
    const createResponse = await createResponsePromise
    expect(createResponse.status()).toBe(201)
    expectNoStore(createResponse)
    const created = (await createResponse.json()) as TemporaryCredentialResult
    expect(created.account).toMatchObject({
      loginName,
      recordVersion: 1,
      role: 'staff',
      status: 'pendingActivation',
    })
    secrets.push(created.temporaryCredential)

    const credentialRegion = ownerPage.getByRole('region', {
      name: '一次性临时凭证',
    })
    const displayedCredentialMatches = await credentialRegion
      .getByLabel('临时凭证')
      .evaluate(
        (element, secret) => element.textContent === secret,
        created.temporaryCredential,
      )
    expect(
      displayedCredentialMatches,
      'temporary credential should be displayed exactly once',
    ).toBe(true)
    const copyButton = credentialRegion.getByRole('button', {
      name: '复制临时凭证',
    })
    await copyButton.focus()
    await expect(copyButton).toBeFocused()
    await ownerPage.keyboard.press('Enter')
    await expect(credentialRegion.locator('[aria-live="polite"]')).toHaveText(
      '临时凭证已复制。',
    )
    const copiedCredentialMatches = await ownerPage.evaluate(
      async (secret) => (await navigator.clipboard.readText()) === secret,
      created.temporaryCredential,
    )
    expect(
      copiedCredentialMatches,
      'clipboard should contain the credential',
    ).toBe(true)
    await expectNotPersisted(ownerPage, secrets)
    await ownerPage.reload()
    await expect(
      ownerPage.locator('output[aria-label="临时凭证"]'),
    ).toHaveCount(0)
    const credentialInReloadedDom = await ownerPage.evaluate(
      (secret) => document.body.textContent?.includes(secret) ?? false,
      created.temporaryCredential,
    )
    expect(
      credentialInReloadedDom,
      'credential must disappear after reload',
    ).toBe(false)

    const forbiddenCreate = await cadre.context.post('/api/v1/admin/accounts', {
      data: {
        accountType: 'external',
        displayName: '虚构越权账号',
        loginName: `blocked-${suffix}`,
        reason: '虚构越权验收',
        role: 'staff',
        studentNumber: null,
      },
      headers: { Authorization: `JWT ${cadre.token}` },
    })
    expect(forbiddenCreate.status(), await forbiddenCreate.text()).toBe(403)
    expect(await forbiddenCreate.json()).toMatchObject({ code: 'FORBIDDEN' })

    await loginThroughAdmin(adminPage, 'e2e-admin', 'Local-admin-Only-2026!')
    await adminPage.goto(`${cmsUrl}/admin/accounts`)
    const adminCreateRole = adminPage
      .getByRole('heading', { name: '创建单个账号' })
      .locator('..')
      .getByLabel('角色', { exact: true })
    await expect(adminCreateRole.locator('option[value="admin"]')).toHaveCount(
      0,
    )
    await adminPage.getByRole('button', { name: /^e2e-cadre/ }).click()
    const adminDetail = adminPage
      .getByRole('heading', { name: '账号详情与操作' })
      .locator('..')
    await expect(
      adminDetail
        .getByLabel('权限', { exact: true })
        .locator('option[value="accounts.manage"]'),
    ).toHaveCount(0)

    const ownerSelfUpdate = await ownerPage.request.patch(
      `${cmsUrl}/api/v1/admin/accounts/${owner.user.id}`,
      {
        data: {
          displayName: '不应生效的所有者修改',
          expectedVersion: 1,
          reason: '虚构越级验收',
          role: 'owner',
        },
      },
    )
    expect(ownerSelfUpdate.status(), await ownerSelfUpdate.text()).toBe(403)

    staffContext = await browser.newContext({
      viewport: { height: 844, width: 390 },
    })
    const activationPage = await staffContext.newPage()
    evidence.push(monitorPage(activationPage))
    await expectAstralPasswordValidation(
      activationPage,
      loginName,
      created.temporaryCredential,
    )
    await activate(
      activationPage,
      loginName,
      created.temporaryCredential,
      firstPassword,
    )
    const activationWidth = await activationPage
      .getByRole('region', { name: '首次激活或重置后设置密码' })
      .evaluate((element) => ({
        client: element.clientWidth,
        scroll: element.scrollWidth,
      }))
    expect(activationWidth.scroll).toBeLessThanOrEqual(activationWidth.client)
    await expectNotPersisted(activationPage, secrets)
    await loginThroughAdmin(activationPage, loginName, firstPassword)
    await expectStaffSessionState(staffContext, 403)

    await ownerPage.goto(`${cmsUrl}/admin/accounts`)
    await ownerPage
      .getByRole('button', { name: new RegExp(`^${loginName}`) })
      .click()
    const detail = ownerPage
      .getByRole('heading', { name: '账号详情与操作' })
      .locator('..')
    await expect(detail.getByText(loginName, { exact: true })).toBeVisible()
    const expiryValue = '2030-01-02T03:04'
    const expectedExpiry = new Date(expiryValue).toISOString()
    const expiryInput = detail.getByLabel('默认角色期限')
    await expect
      .poll(async () => {
        await expiryInput.fill(expiryValue)
        await ownerPage.waitForTimeout(50)
        return expiryInput.inputValue()
      })
      .toBe(expiryValue)
    await expiryInput.press('Tab')
    await detail
      .getByLabel('操作原因（同时用于下方操作）')
      .fill('虚构 E2E 期限验收')
    const updateResponsePromise = ownerPage.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.pathname === `/api/v1/admin/accounts/${created.account.id}` &&
        response.request().method() === 'PATCH'
      )
    })
    const updateButton = detail.getByRole('button', { name: '保存资料' })
    await updateButton.focus()
    await expect(updateButton).toBeFocused()
    await ownerPage.keyboard.press('Enter')
    const updateResponse = await updateResponsePromise
    expect(updateResponse.ok()).toBe(true)
    expectNoStore(updateResponse)
    const updateRequestBody = updateResponse.request().postDataJSON() as {
      defaultRoleExpiresAt?: string
    }
    expect(updateRequestBody.defaultRoleExpiresAt).toBe(expectedExpiry)
    const updateBody = (await updateResponse.json()) as {
      defaultRoleExpiresAt: null | string
    }
    expect(updateBody.defaultRoleExpiresAt).toBe(expectedExpiry)
    await expect(expiryInput).toHaveValue(expiryValue)
    const expiryRefreshPromise = ownerPage.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.pathname === `/api/v1/admin/accounts/${created.account.id}` &&
        response.request().method() === 'GET'
      )
    })
    await ownerPage.getByRole('button', { name: '刷新账号' }).click()
    const expiryRefreshResponse = await expiryRefreshPromise
    expect(expiryRefreshResponse.ok()).toBe(true)
    expectNoStore(expiryRefreshResponse)
    const expiryRefreshBody = (await expiryRefreshResponse.json()) as {
      defaultRoleExpiresAt: null | string
    }
    expect(expiryRefreshBody.defaultRoleExpiresAt).toBe(expectedExpiry)
    await expect(expiryInput).toHaveValue(expiryValue)

    const staffAuditBefore = await staffContext.request.get(
      `${cmsUrl}/api/audit-events`,
    )
    expect(staffAuditBefore.status()).toBe(403)

    const permissionSelect = detail.getByLabel('权限', { exact: true })
    await expect(permissionSelect).toHaveAttribute(
      'aria-describedby',
      'override-permission-help',
    )
    await expect(detail.locator('#override-permission-help')).toBeVisible()
    await permissionSelect.selectOption('recruitment.application.read')
    await expect(detail.getByLabel('范围', { exact: true })).toHaveValue(
      'recruitmentCycle',
    )
    const fakeCycleId = randomUUID()
    await detail.getByLabel('招新届次 ID').fill(fakeCycleId)
    const invalidOverridePromise = ownerPage.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(
        `/accounts/${created.account.id}/overrides`,
      ),
    )
    await detail.getByRole('button', { name: '设置权限覆盖' }).click()
    const invalidOverrideResponse = await invalidOverridePromise
    expect(invalidOverrideResponse.status()).toBe(400)
    const invalidOverrideBody = (await invalidOverrideResponse.json()) as {
      code?: string
      details?: { issues?: Array<{ path?: Array<string> }> }
    }
    expect(invalidOverrideBody.code).toBe('VALIDATION_FAILED')
    expect(invalidOverrideBody.details?.issues?.[0]?.path).toEqual([
      'recruitmentCycleId',
    ])
    const cycleInput = detail.getByLabel('招新届次 ID')
    await expect(cycleInput).toHaveAttribute('aria-invalid', 'true')
    await expect(cycleInput).toHaveAttribute(
      'aria-describedby',
      'override-cycle-error',
    )
    await expect(cycleInput).toHaveValue(fakeCycleId)

    const overridePath = `**/api/v1/admin/accounts/${created.account.id}/overrides`
    await ownerPage.route(overridePath, (route) => route.abort('failed'))
    await detail.getByRole('button', { name: '设置权限覆盖' }).click()
    await expect(
      ownerPage.getByRole('alert').filter({ hasText: '账号服务暂时不可用' }),
    ).toBeVisible()
    await expect(cycleInput).toHaveValue(fakeCycleId)
    await ownerPage.unroute(overridePath)

    await permissionSelect.selectOption('audit.read')
    await expect(detail.getByLabel('范围', { exact: true })).toHaveValue(
      'global',
    )
    const grantResponsePromise = ownerPage.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(
        `/accounts/${created.account.id}/overrides`,
      ),
    )
    const grantButton = detail.getByRole('button', {
      name: '设置权限覆盖',
    })
    await grantButton.focus()
    await ownerPage.keyboard.press('Enter')
    const grantResponse = await grantResponsePromise
    expect(grantResponse.status()).toBe(201)
    expectNoStore(grantResponse)
    const staffAuditAfterGrant = await staffContext.request.get(
      `${cmsUrl}/api/audit-events`,
    )
    expect(staffAuditAfterGrant.status()).toBe(200)

    const auditOverrideItem = detail
      .locator('li')
      .filter({ hasText: 'audit.read' })
    ownerPage.once('dialog', (dialog) => dialog.accept())
    const revokeResponsePromise = ownerPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.includes('/overrides/') &&
        new URL(response.url()).pathname.endsWith('/revoke'),
    )
    await auditOverrideItem.getByRole('button', { name: '撤销' }).click()
    const revokeResponse = await revokeResponsePromise
    expect(revokeResponse.ok()).toBe(true)
    expectNoStore(revokeResponse)
    const staffAuditAfterRevoke = await staffContext.request.get(
      `${cmsUrl}/api/audit-events`,
    )
    expect(staffAuditAfterRevoke.status()).toBe(403)

    const freshDetailResponse = await owner.context.get(
      `/api/v1/admin/accounts/${created.account.id}`,
      { headers: { Authorization: `JWT ${owner.token}` } },
    )
    expect(freshDetailResponse.ok()).toBe(true)
    const freshDetail = (await freshDetailResponse.json()) as {
      displayName: string
      recordVersion: number
    }
    const concurrentDisplayName = `${displayName} 并发`
    const concurrentUpdate = await owner.context.patch(
      `/api/v1/admin/accounts/${created.account.id}`,
      {
        data: {
          defaultRoleExpiresAt: expectedExpiry,
          displayName: concurrentDisplayName,
          expectedVersion: freshDetail.recordVersion,
          reason: '虚构 E2E 并发更新',
          role: 'staff',
        },
        headers: { Authorization: `JWT ${owner.token}` },
      },
    )
    expect(concurrentUpdate.ok()).toBe(true)
    await detail.getByLabel('显示名').fill(`${displayName} 陈旧提交`)
    const conflictResponsePromise = ownerPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith(
          `/accounts/${created.account.id}`,
        ) && response.request().method() === 'PATCH',
    )
    await detail.getByRole('button', { name: '保存资料' }).click()
    const conflictResponse = await conflictResponsePromise
    expect(conflictResponse.status()).toBe(409)
    await expect(
      ownerPage.getByRole('alert').filter({ hasText: '账号已被其他操作更新' }),
    ).toBeVisible()
    await expect(detail.getByLabel('显示名')).toHaveValue(
      `${displayName} 陈旧提交`,
    )
    await ownerPage.getByRole('button', { name: '刷新详情' }).click()
    await expect(detail.getByLabel('显示名')).toHaveValue(concurrentDisplayName)

    await detail
      .getByLabel('操作原因（同时用于下方操作）')
      .fill('虚构 E2E 重置验收')
    ownerPage.once('dialog', (dialog) => dialog.accept())
    const resetResponsePromise = ownerPage.waitForResponse((response) =>
      isAccountAction(response, created.account.id, 'reset'),
    )
    const loginFirstResponse = await raceApi.post('/api/auth-users/login', {
      data: { password: firstPassword, username: loginName },
    })
    expect(loginFirstResponse.status()).toBe(200)
    await detail.getByRole('button', { name: '重置凭证' }).click()
    const resetResponse = await resetResponsePromise
    expect(resetResponse.ok()).toBe(true)
    expectNoStore(resetResponse)
    const resetRaceOrder = await assertLoginFirstTokenRevoked(
      raceApi,
      loginFirstResponse,
    )
    expect(resetRaceOrder).toBe('login-first-token-revoked')
    test.info().annotations.push({
      description: resetRaceOrder,
      type: 'reset-race-order',
    })
    const reset = (await resetResponse.json()) as TemporaryCredentialResult
    secrets.push(reset.temporaryCredential)
    await expectStaffSessionState(staffContext, 401)
    await expectNotPersisted(ownerPage, secrets)

    resetContext = await browser.newContext({
      viewport: { height: 844, width: 390 },
    })
    const resetPage = await resetContext.newPage()
    evidence.push(monitorPage(resetPage))
    await activate(
      resetPage,
      loginName,
      reset.temporaryCredential,
      secondPassword,
    )
    await loginThroughAdmin(resetPage, loginName, secondPassword)
    await expectStaffSessionState(resetContext, 403)

    await ownerPage.goto(`${cmsUrl}/admin/accounts`)
    await ownerPage
      .getByRole('button', { name: new RegExp(`^${loginName}`) })
      .click()
    const refreshedDetail = ownerPage
      .getByRole('heading', { name: '账号详情与操作' })
      .locator('..')
    await expect(
      refreshedDetail.getByText(loginName, { exact: true }),
    ).toBeVisible()
    await refreshedDetail
      .getByLabel('操作原因（同时用于下方操作）')
      .fill('虚构 E2E 停用验收')
    ownerPage.once('dialog', (dialog) => dialog.accept())
    const disableResponsePromise = ownerPage.waitForResponse((response) =>
      isAccountAction(response, created.account.id, 'disable'),
    )
    let disableResponseFinished = false
    void disableResponsePromise.then(() => {
      disableResponseFinished = true
    })
    await refreshedDetail.getByRole('button', { name: '停用账号' }).click()
    await ownerPage.waitForTimeout(25)
    expect(
      disableResponseFinished,
      'disable and login requests must overlap',
    ).toBe(false)
    const disableRaceLogin = raceApi.post('/api/auth-users/login', {
      data: { password: secondPassword, username: loginName },
    })
    const disableResponse = await disableResponsePromise
    expect(disableResponse.ok(), 'disable should succeed').toBe(true)
    expectNoStore(disableResponse)
    await assertTerminalFirstLoginRejected(await disableRaceLogin)
    test.info().annotations.push({
      description: 'terminal-first-401',
      type: 'disable-race-order',
    })
    await expectStaffSessionState(resetContext, 401)

    await refreshedDetail
      .getByLabel('操作原因（同时用于下方操作）')
      .fill('虚构 E2E 重新启用验收')
    ownerPage.once('dialog', (dialog) => dialog.accept())
    const reenableResponsePromise = ownerPage.waitForResponse((response) =>
      isAccountAction(response, created.account.id, 'reenable'),
    )
    const reenableButton = refreshedDetail.getByRole('button', {
      name: '重新启用并签发凭证',
    })
    await reenableButton.focus()
    await ownerPage.keyboard.press('Enter')
    const reenableResponse = await reenableResponsePromise
    expect(reenableResponse.ok()).toBe(true)
    expectNoStore(reenableResponse)
    const reenabled =
      (await reenableResponse.json()) as TemporaryCredentialResult
    expect(reenabled.account.status).toBe('pendingActivation')
    secrets.push(reenabled.temporaryCredential)
    const oldPasswordLogin = await raceApi.post('/api/auth-users/login', {
      data: { password: secondPassword, username: loginName },
    })
    expect(oldPasswordLogin.status()).toBe(401)
    const oldPasswordBody = await oldPasswordLogin.text()
    expect(/"(?:token|session)"\s*:/.test(oldPasswordBody)).toBe(false)
    await activate(
      resetPage,
      loginName,
      reenabled.temporaryCredential,
      thirdPassword,
    )
    await loginThroughAdmin(resetPage, loginName, thirdPassword)
    await expectStaffSessionState(resetContext, 403)
    await expectNotPersisted(resetPage, secrets)

    await ownerPage.setViewportSize({ height: 844, width: 390 })
    const pageWidth = await ownerPage.locator('main').evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }))
    expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client)
    const refreshButton = ownerPage.getByRole('button', { name: '刷新账号' })
    await refreshButton.focus()
    await expect(refreshButton).toBeFocused()
  } finally {
    await Promise.all([
      cadre.context.dispose(),
      raceApi.dispose(),
      owner.context.dispose(),
      ownerContext.close(),
      adminContext.close(),
      staffContext?.close(),
      resetContext?.close(),
    ])
  }

  for (const item of evidence) {
    expect(item.pageErrors).toEqual([])
    const consoleLeakedSecret = item.consoleMessages.some((message) =>
      secrets.some((secret) => message.includes(secret)),
    )
    expect(consoleLeakedSecret, 'console must not contain a secret').toBe(false)
  }
})

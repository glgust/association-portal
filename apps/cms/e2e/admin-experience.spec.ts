import { expect, request, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const cmsUrl = process.env.PLAYWRIGHT_CMS_SERVER_URL ?? 'http://127.0.0.1:3201'
const webUrl = 'http://127.0.0.1:3100'

const accounts = {
  admin: ['e2e-admin', 'Local-admin-Only-2026!'],
  cadre: ['e2e-cadre', 'Local-cadre-Only-2026!'],
  owner: ['e2e-owner', 'Local-owner-Only-2026!'],
  staff: ['e2e-staff', 'Local-staff-Only-2026!'],
} as const

const internalCollectionPaths = [
  'auth-users',
  'permission-overrides',
  'account-claims',
  'member-intake-applications',
  'review-actions',
  'form-versions',
] as const

async function loginThroughAdmin(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto(`${cmsUrl}/admin`)
  await page.locator('#field-username').fill(username)
  await page.locator('#field-password').fill(password)
  const response = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === '/api/auth-users/login' &&
      candidate.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '登录' }).click()
  expect((await response).ok()).toBe(true)
  await expect(page).toHaveURL(/\/admin(?:\/|$)/)
}

async function loginApi(username: string, password: string) {
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

async function createActiveMember(): Promise<{
  password: string
  studentNumber: string
}> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const fixture = {
    contact: `fictional-admin-nav-${suffix}`,
    name: `虚构导航会员${suffix}`,
    password: `Fictional member navigation ${suffix}!`,
    studentNumber: `73${Date.now().toString().slice(-10)}`,
  }
  const owner = await loginApi(...accounts.owner)
  const publicApi = await request.newContext({ baseURL: webUrl })
  try {
    const authorization = { Authorization: `JWT ${owner.token}` }
    const preconfigure = await owner.context.post(
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
        headers: authorization,
      },
    )
    expect(preconfigure.status(), await preconfigure.text()).toBe(201)

    const submitted = await publicApi.post('/api/membership/account-claims', {
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
        password: fixture.password,
        passwordConfirmation: fixture.password,
        studentNumber: fixture.studentNumber,
      },
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(submitted.status(), await submitted.text()).toBe(201)
    const { accountClaimId } = (await submitted.json()) as {
      accountClaimId: string
    }
    const detailResponse = await owner.context.get(
      `/api/v1/admin/member-account-claims/claims/${accountClaimId}`,
      { headers: authorization },
    )
    expect(detailResponse.ok(), await detailResponse.text()).toBe(true)
    const detail = (await detailResponse.json()) as {
      accountRecordVersion: number
      id: string
      recordVersion: number
    }
    const approved = await owner.context.post(
      `/api/v1/admin/member-account-claims/claims/${detail.id}/approve`,
      {
        data: {
          confirmCurrentAuthorization: false,
          expectedAccountVersion: detail.accountRecordVersion,
          expectedClaimVersion: detail.recordVersion,
        },
        headers: authorization,
      },
    )
    expect(approved.ok(), await approved.text()).toBe(true)
    return fixture
  } finally {
    await Promise.all([owner.context.dispose(), publicApi.dispose()])
  }
}

test.describe('CMS 管理体验', () => {
  test('owner/admin/cadre/staff see role-derived Chinese task navigation', async ({
    browser,
  }) => {
    const expected = {
      owner: ['会员与账号', '内容管理', '系统与审计', '历史与 Demo'],
      admin: ['会员与账号', '内容管理', '系统与审计', '历史与 Demo'],
      cadre: ['内容管理', '系统与审计', '历史与 Demo'],
      staff: ['内容管理', '历史与 Demo'],
    } as const

    for (const [role, credentials] of Object.entries(accounts)) {
      const context = await browser.newContext()
      const page = await context.newPage()
      try {
        await loginThroughAdmin(page, credentials[0], credentials[1])
        await expect(
          page.getByRole('heading', { level: 1, name: '管理工作台' }),
        ).toBeVisible()
        await expect(
          page.getByRole('navigation', { name: '后台任务导航' }),
        ).toHaveCount(1)
        const nav = page.getByRole('navigation', { name: '后台任务导航' })
        await expect(nav.getByRole('link', { name: '工作台' })).toBeVisible()
        for (const group of expected[role as keyof typeof expected]) {
          await expect(nav.getByText(group, { exact: true })).toBeVisible()
        }
        for (const slug of internalCollectionPaths) {
          await expect(nav.locator(`a[href*="/${slug}"]`)).toHaveCount(0)
        }
        await expect(nav.locator('a.nav__log-out')).toHaveCount(1)
        await expect(nav.locator('a.nav__log-out')).toHaveAttribute(
          'aria-label',
          '登出',
        )
      } finally {
        await context.close()
      }
    }
  })

  test('active member gets the task dashboard and minimal member landing without management links', async ({
    page,
  }) => {
    test.setTimeout(300_000)
    const member = await createActiveMember()
    await loginThroughAdmin(page, member.studentNumber, member.password)
    await expect(page).toHaveURL(/\/admin\/?$/)
    await expect(
      page.getByRole('heading', { level: 1, name: '管理工作台' }),
    ).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: '后台任务导航' }),
    ).toHaveCount(1)
    await expect(page.getByRole('link', { name: /账号管理/ })).toHaveCount(0)
    await page.getByRole('link', { name: '进入我的协会账号' }).click()
    await expect(page).toHaveURL(/\/admin\/member-account(?:\/|$)/)
    await expect(page.getByRole('heading', { name: /^你好，/ })).toBeVisible()
  })

  test('internal collections stay hidden while direct access remains denied', async ({
    page,
  }) => {
    await loginThroughAdmin(page, ...accounts.owner)
    const nav = page.getByRole('navigation', { name: '后台任务导航' })
    for (const slug of internalCollectionPaths) {
      await expect(nav.locator(`a[href*="/${slug}"]`)).toHaveCount(0)
    }

    const api = await page.request.get(`${cmsUrl}/api/permission-overrides`)
    expect(api.status()).toBe(403)
    const body = await api.text()
    expect(body).not.toContain('accounts.manage')
    expect(body).not.toContain('grantedBy')

    await page.goto(`${cmsUrl}/admin/collections/permission-overrides`)
    await expect(page).toHaveURL(/\/admin\/collections\/permission-overrides/)
    await expect(
      page
        .getByRole('navigation', { name: '后台任务导航' })
        .getByRole('link', { name: '工作台' }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: '权限覆盖' })).toHaveCount(0)
    await expect(page.locator('table')).toHaveCount(0)

    await page.goto(`${cmsUrl}/admin/collections/auth-users`)
    await expect(page).toHaveURL(/\/admin\/collections\/auth-users(?:\/|$)/)
    await expect(page.getByRole('heading', { name: '认证账号' })).toHaveCount(0)
    await expect(page.locator('table')).toHaveCount(0)
  })

  test('history and Demo warning remains visible and forbids real personal data', async ({
    page,
  }) => {
    await loginThroughAdmin(page, ...accounts.owner)
    await expect(
      page.getByText(
        '仅用于演示和工程调试，不是当前正式会员身份核验或账号申领入口；不得录入真实个人资料。',
        { exact: true },
      ),
    ).toBeVisible()
    const legacy = page
      .getByRole('navigation', { name: '后台任务导航' })
      .getByText('历史与 Demo', { exact: true })
    await expect(legacy).toBeVisible()
  })

  test('390px and keyboard keep primary navigation and recovery actions usable', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 })
    await loginThroughAdmin(page, ...accounts.staff)
    const nav = page.getByRole('navigation', { name: '后台任务导航' })
    const dashboardLink = nav.getByRole('link', { name: '工作台' })
    await dashboardLink.focus()
    await expect(dashboardLink).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/admin\/?$/)
    const dimensions = await page.locator('body').evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }))
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client)

    await page.goto(`${cmsUrl}/admin/accounts`)
    await expect(page.getByText('你没有访问此管理页面的权限')).toBeVisible()
    const back = page.getByRole('link', { name: '返回工作台' })
    await back.focus()
    await expect(back).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/admin\/?$/)

    await page.goto(`${cmsUrl}/admin/member-account-claims`)
    await expect(page.getByText('你没有访问此管理页面的权限')).toBeVisible()
  })

  test('an unavailable account queue keeps a Chinese retry path', async ({
    page,
  }) => {
    await loginThroughAdmin(page, ...accounts.owner)
    await page.route('**/api/v1/admin/accounts', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          code: 'INTERNAL_ERROR',
          message: 'Fictional unavailable response',
          requestId: 'fictional-request-id',
        }),
        contentType: 'application/json',
        status: 503,
      })
    })
    await page.goto(`${cmsUrl}/admin/accounts`)
    await expect(
      page.getByText('账号服务暂时不可用，请稍后重试。'),
    ).toBeVisible()
    const retry = page.getByRole('button', { name: '刷新账号' })
    await retry.focus()
    await expect(retry).toBeFocused()
  })

  test('content lists expose one shell, location, edit guidance, and no row selection', async ({
    page,
  }) => {
    await loginThroughAdmin(page, ...accounts.owner)
    for (const slug of [
      'association-pages',
      'announcements',
      'activities',
      'news',
    ]) {
      await page.goto(`${cmsUrl}/admin/collections/${slug}`)
      await expect(
        page.getByRole('navigation', { name: '后台任务导航' }),
      ).toHaveCount(1)
      await expect(page.getByText('点击标题进入编辑。')).toBeVisible()
      await expect(page.locator('table').getByRole('checkbox')).toHaveCount(0)
      await expect(page.locator('body')).not.toContainText('未激活账号')
    }
  })
})

import { expect, test } from '@playwright/test'

test('public announcements show a controlled unavailable state', async ({
  page,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_EXPECT_UNAVAILABLE !== 'true',
    'Run with an intentionally unavailable PLAYWRIGHT_CMS_API_URL',
  )

  await page.goto('/announcements')
  await expect(
    page.getByRole('heading', { name: '暂时无法载入公告' }),
  ).toBeVisible()
  await expect(
    page.getByText('公告服务暂时无法连接，请稍后再试。'),
  ).toBeVisible()
})

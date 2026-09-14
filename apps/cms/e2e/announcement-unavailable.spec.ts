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
  await expect(page.getByText('请稍后刷新重试。')).toBeVisible()
  await expect(page.getByText(/^请求编号：/)).toBeVisible()

  await page.goto('/announcements/fictional-unavailable-announcement')
  await expect(
    page.getByRole('heading', { name: '暂时无法载入公告' }),
  ).toBeVisible()
  await expect(page.getByText(/^请求编号：/)).toBeVisible()
})

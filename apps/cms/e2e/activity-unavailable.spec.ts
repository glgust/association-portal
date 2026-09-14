import { expect, test } from '@playwright/test'

test('public activities show controlled unavailable states', async ({
  page,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_EXPECT_UNAVAILABLE !== 'true',
    'Run with an intentionally unavailable PLAYWRIGHT_CMS_API_URL',
  )

  await page.goto('/activities')
  await expect(
    page.getByRole('heading', { name: '暂时无法载入活动目录' }),
  ).toBeVisible()
  await expect(
    page.getByText('活动服务暂时无法连接，请稍后再试。'),
  ).toBeVisible()
  await expect(page.getByText(/^请求编号：/)).toBeVisible()

  await page.goto('/activities/fictional-unavailable-activity')
  await expect(
    page.getByRole('heading', { name: '暂时无法载入活动' }),
  ).toBeVisible()
  await expect(page.getByText(/^请求编号：/)).toBeVisible()
})

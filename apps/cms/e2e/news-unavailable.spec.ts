import { expect, test } from '@playwright/test'

test('public News shows a controlled unavailable state and request id', async ({
  page,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_EXPECT_UNAVAILABLE !== 'true',
    'Run with an intentionally unavailable PLAYWRIGHT_CMS_API_URL',
  )
  await page.goto('/news')
  await expect(
    page.getByRole('heading', { name: '暂时无法载入新闻' }),
  ).toBeVisible()
  await expect(
    page.getByText('新闻服务暂时无法连接，请稍后再试。'),
  ).toBeVisible()
  await expect(page.getByText(/请求编号：/)).toBeVisible()
})

import { expect, test } from '@playwright/test'

test('panel loads and shows the backend status badge', async ({ page }) => {
  await page.goto('/')

  const badge = page.getByTestId('status-badge')
  await expect(badge).toBeVisible()

  await page.screenshot({ path: 'e2e/artifacts/smoke.png' })
})

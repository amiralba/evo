import { expect, test } from '@playwright/test'

test('panel loads and redirects an unauthenticated visitor to /login', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('#email')).toBeVisible()

  await page.screenshot({ path: 'e2e/artifacts/smoke.png' })
})

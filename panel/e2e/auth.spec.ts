import { expect, test } from '@playwright/test'

test('logs in with the seeded Supervisor and reaches the protected page', async ({ page }) => {
  await page.goto('/login')

  await page.fill('#email', 'admin@evo.local')
  await page.fill('#password', 'Demo1234!')
  await page.click('button[type=submit]')

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('status-badge')).toBeVisible()

  await page.screenshot({ path: 'e2e/artifacts/auth-login.png' })
})

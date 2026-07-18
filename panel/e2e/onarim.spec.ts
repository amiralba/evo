import { expect, test } from '@playwright/test'

test('Onarım flow: open workbench, decide a row, apply', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', 'admin@evo.local')
  await page.fill('#password', 'Demo1234!')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('link', { name: 'Planlama' }).click()
  await expect(page).toHaveURL(/\/planner$/)

  const onarimTrigger = page.getByTestId('onarim-trigger')
  await expect(onarimTrigger).toBeVisible({ timeout: 15_000 })
  await onarimTrigger.click()
  await expect(page.locator('.modal-head')).toHaveText('Onarım')

  // Pick a disruption that still has affected visits — earlier test runs against this same seeded
  // dev DB may have already resolved some disruptions, so `.first()` isn't reliable across reruns.
  const disruptionRow = page.getByTestId('disruption-row').filter({ hasNotText: /(?<!\d)0 etkilenen ziyaret/ }).first()
  await expect(disruptionRow).toBeVisible({ timeout: 15_000 })
  await disruptionRow.click()

  const affectedRows = page.getByTestId('affected-visit-row')
  await expect(affectedRows.first()).toBeVisible({ timeout: 15_000 })
  const rowCount = await affectedRows.count()
  for (let i = 0; i < rowCount; i++) {
    await affectedRows.nth(i).locator('select').first().selectOption('1')
  }

  const textareas = page.locator('.modal-body textarea')
  await textareas.nth(0).fill('E2E: merchandiser sick')
  await textareas.nth(1).fill('E2E: keep store coverage')

  await page.getByTestId('onarim-apply').click()
  await expect(page.locator('.modal-body')).toContainText('Onarım uygulandı.', { timeout: 15_000 })

  await page.screenshot({ path: 'e2e/artifacts/onarim.png' })
})

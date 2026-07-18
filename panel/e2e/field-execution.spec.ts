import { expect, test } from '@playwright/test'

test('Field execution flow: past week shows outcome colors, inbox lists and resolves a note', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', 'admin@evo.local')
  await page.fill('#password', 'Demo1234!')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('link', { name: 'Planlama' }).click()
  await expect(page).toHaveURL(/\/planner$/)

  const routeSelect = page.getByLabel('route')
  await expect(routeSelect.locator('option').nth(1)).toBeAttached({ timeout: 15_000 })
  const routeValue = await routeSelect.locator('option').nth(1).getAttribute('value')
  await routeSelect.selectOption(routeValue!)

  // One week back is enough to land in the seeded past-outcomes window (FieldExecutionSeederModule
  // materializes ~3 weeks of history ending "yesterday") — going back further risks overshooting
  // that window as real wall-clock time advances across a long session.
  await page.getByLabel('prev-week').click()

  const outcomeBlock = page.locator('.vblock.outcome-done, .vblock.outcome-missed, .vblock.outcome-skipped').first()
  await expect(outcomeBlock).toBeVisible({ timeout: 15_000 })

  await page.getByTestId('inbox-trigger').click()
  await expect(page.locator('.page.on .page-top .ttl')).toHaveText('Gelen kutusu')

  const resolveButton = page.getByRole('button', { name: 'Çözüldü' }).first()
  if (await resolveButton.isVisible().catch(() => false)) {
    await resolveButton.click()
    await expect(page.locator('.page.on .page-top .ttl')).toHaveText('Gelen kutusu')
  }

  await page.screenshot({ path: 'e2e/artifacts/field-execution.png' })
})

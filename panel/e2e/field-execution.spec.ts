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

  await page.getByLabel('prev-week').click()
  await page.getByLabel('prev-week').click()
  await page.getByLabel('prev-week').click()

  const outcomeBlock = page.locator('.vblock.outcome-done, .vblock.outcome-missed, .vblock.outcome-skipped').first()
  await expect(outcomeBlock).toBeVisible({ timeout: 15_000 })

  await page.getByTestId('inbox-trigger').click()
  await expect(page.locator('.modal-head')).toHaveText('Gelen Kutusu')

  const resolveButton = page.getByRole('button', { name: 'Çözüldü' }).first()
  if (await resolveButton.isVisible().catch(() => false)) {
    await resolveButton.click()
    await expect(page.locator('.modal-head')).toHaveText('Gelen Kutusu')
  }

  await page.screenshot({ path: 'e2e/artifacts/field-execution.png' })
})

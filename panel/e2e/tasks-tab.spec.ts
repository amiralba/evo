import { expect, test } from '@playwright/test'

test('Görevler flow: open a route, view resolved tasks, open the scope modal', async ({ page }) => {
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

  await page.getByText('Görevler').click()

  const taskRow = page.locator('.kv').first()
  await expect(taskRow).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.pill').first()).toBeVisible()

  await taskRow.click()
  await expect(page.getByText('Kapsam seç')).toBeVisible()

  await page.getByLabel(/Bu mağaza için/).check()
  await expect(page.getByText('Etki önizlemesi')).toBeVisible({ timeout: 15_000 })

  await page.screenshot({ path: 'e2e/artifacts/tasks-tab.png' })
})

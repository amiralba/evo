import { expect, test } from '@playwright/test'

test('planner core flow: login -> open workspace -> filter -> bulk-add -> health updates -> publish', async ({ page }) => {
  // 1. Login + open workspace
  await page.goto('/login')
  await page.fill('#email', 'admin@evo.local')
  await page.fill('#password', 'Demo1234!')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('link', { name: 'Planlama' }).click()
  await expect(page).toHaveURL(/\/planner$/)
  await expect(page.getByLabel('province')).toBeVisible()

  // 2. Filter to a route via the top-bar route select (seeded demo data has >=1 route per province)
  const routeSelect = page.getByLabel('route')
  await expect(routeSelect.locator('option').nth(1)).toBeAttached({ timeout: 15_000 })
  const routeValue = await routeSelect.locator('option').nth(1).getAttribute('value')
  await routeSelect.selectOption(routeValue!)

  await expect(page.getByTestId('week-range')).not.toHaveText('', { timeout: 10_000 })

  // 3. Switch to the Tablo layout to reach the checkbox/list multi-select (not the map lasso).
  // Exact match — the schedule pane also has a "▤ Tabloda gör" drawer-toggle button (prototype
  // wording), which a substring match on "Tablo" would ambiguously also hit.
  await page.getByRole('button', { name: 'Tablo', exact: true }).click()
  const firstCheckbox = page.locator('[data-testid^="select-store-"]').first()
  await expect(firstCheckbox).toBeVisible({ timeout: 15_000 })

  // Capture stop count before the add
  const stopsBefore = await page.locator('text=/varsayılan|dk$/').count()

  await firstCheckbox.check()
  await page.getByRole('button', { name: /Rotaya ekle/ }).click()

  // 4. Health/stops update after the mutation invalidates the route query
  await expect(async () => {
    const stopsAfter = await page.locator('text=/varsayılan|dk$/').count()
    expect(stopsAfter).toBeGreaterThan(stopsBefore)
  }).toPass({ timeout: 15_000 })

  // 5. Publish — tolerant of both the clean and override-with-reason paths
  await page.getByTestId('publish-trigger').click()
  const modal = page.getByText('Yayın öncesi inceleme')
  await expect(modal).toBeVisible()

  // Findings load async — wait for the modal to settle (either the reason field or the
  // no-findings message) before deciding which publish path this run takes.
  const submitButton = page.getByTestId('publish-modal-submit')
  const reasonBox = page.getByLabel(/Neden/)
  await expect(async () => {
    const settled = (await reasonBox.isVisible().catch(() => false)) || !(await submitButton.isDisabled())
    expect(settled).toBe(true)
  }).toPass({ timeout: 15_000 })

  if (await reasonBox.isVisible().catch(() => false)) {
    await reasonBox.fill('E2E test override reason')
    await page.getByLabel(/Amaç/).fill('E2E test override objective')
  }

  await expect(submitButton).toBeEnabled({ timeout: 5_000 })
  await submitButton.click()
  await expect(page.getByText(/Oluşturulan ziyaret sayısı/)).toBeVisible({ timeout: 15_000 })

  await page.screenshot({ path: 'e2e/artifacts/planner-core.png' })
})

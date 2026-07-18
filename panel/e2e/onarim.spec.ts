import { expect, test } from '@playwright/test'

test('Onarım flow: open inbox Sorunlar tab, pick a disruption, decide a row, apply', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', 'admin@evo.local')
  await page.fill('#password', 'Demo1234!')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('link', { name: 'Planlama' }).click()
  await expect(page).toHaveURL(/\/planner$/)

  // Onarım is reached via the inbox's Sorunlar tab, not a standalone topbar button.
  await page.getByTestId('inbox-trigger').click()
  await expect(page.locator('.page-top .ttl')).toHaveText('Gelen kutusu')
  await page.getByTestId('inbox-issues-tab').click()

  // Pick a disruption that still has affected visits — earlier test runs against this same seeded
  // dev DB may have already resolved some disruptions, so `.first()` isn't reliable across reruns.
  // Reads the data-affected-count attribute directly rather than text-matching: the rendered row
  // concatenates the end date and the count with no separator (e.g. "...07-24" + "0 etkilenen" reads
  // as "240 etkilenen"), which broke an earlier text/regex-based filter.
  const issueRows = page.getByTestId('issue-row')
  await expect(issueRows.first()).toBeVisible({ timeout: 15_000 })
  const counts = await issueRows.evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-affected-count'))))
  const pickIndex = counts.findIndex((c) => c > 0)
  expect(pickIndex, `no disruption with affected visits found among counts=${JSON.stringify(counts)}`).toBeGreaterThanOrEqual(0)
  await issueRows.nth(pickIndex).click()

  await expect(page.locator('.modal-head')).toHaveText('Onarım')

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

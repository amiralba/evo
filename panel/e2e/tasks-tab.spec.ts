import { expect, test } from '@playwright/test'
import { login, openPlanner } from './helpers'

/**
 * Görevler tab against the hosted prototype: focus a store from the rail's Havuz tab, open the
 * panel's Görevler tab, and assert the tasksBridge swapped in REAL resolved tasks from
 * GET /stores/{id}/task-plan (name · minutes · rule-source tag · visit total) — not the
 * prototype's mock task list. Requires the seeded task-template/rule catalog (TaskRuleSeederModule).
 */
test('Görevler tab shows backend-resolved tasks for a focused store', async ({ page }) => {
  await login(page)
  await openPlanner(page)

  // Focus a store without touching the map: Havuz tab lists unassigned stores; clicking one
  // focuses it in the right panel.
  await page.locator('.rail .tabs div[data-t=pool]').click()
  const firstStore = page.locator('#railList .pool-item').first()
  await expect(firstStore, 'pool is empty — the spec needs an unassigned store to focus').toBeVisible({
    timeout: 10_000,
  })
  await firstStore.click()

  await page.locator('#panelTabs div[data-t=tasks]').click()

  // tasksBridge paints "Görevler yükleniyor…" then swaps in resolved rows once the API answers.
  const body = page.locator('#panelBody')
  await expect(body.locator('.task-row').first()).toBeVisible({ timeout: 15_000 })
  await expect(body).toContainText(/\ddk/)
  await expect(body).toContainText('Ziyaret toplamı')
  await expect(body).toContainText('süreler kurallarla çözülür (backend)')

  await page.screenshot({ path: 'e2e/artifacts/tasks-tab.png' })
})

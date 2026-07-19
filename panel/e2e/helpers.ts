import { expect, type Page } from '@playwright/test'

/** Log in as the seeded bootstrap Supervisor and land on the dashboard. */
export async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.fill('#email', 'admin@evo.local')
  await page.fill('#password', 'Demo1234!')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/$/)
}

/**
 * Open /planner and wait until the hosted prototype has BOOTED ON BACKEND DATA. Crucial detail:
 * the engine paints its MOCK seed immediately at boot, and PrototypeHost hides that flash with
 * opacity 0 until the first backend load lands (reveal). Playwright treats opacity-0 nodes as
 * "visible", so DOM-presence checks race the backend load and interact with mock data — the
 * only trustworthy gate is the host's own reveal: opacity 1 on .evo-proto-root.
 */
export async function openPlanner(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Planlama' }).click()
  await expect(page).toHaveURL(/\/planner$/)
  await expect(page.locator('.evo-proto-root')).toHaveCSS('opacity', '1', { timeout: 30_000 })
  await expect(page.locator('#railList').getByText('+ Yeni rut')).toBeVisible()
}

/**
 * Drive the prototype's publish modal to completion. The publish gate never blocks: with plan
 * errors present a justification (#pubReason, min 5 chars) is required, otherwise #confirmPub
 * is immediately enabled — handle both paths.
 */
export async function confirmPublish(page: Page): Promise<void> {
  await page.click('#publishBtn')
  await expect(page.locator('#pubModal .modal-head')).toContainText('Yayın özeti')
  const reason = page.locator('#pubReason')
  if (await reason.isVisible().catch(() => false)) {
    await reason.fill('E2E: otomatik test yayını — gerekçe')
  }
  const confirm = page.locator('#confirmPub')
  await expect(confirm).toBeEnabled()
  await confirm.click()
}

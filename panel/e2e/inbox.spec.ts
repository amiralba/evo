import { expect, test } from '@playwright/test'
import { login, openPlanner } from './helpers'

/**
 * The inbox (Gelen kutusu) against the hosted prototype — replaces the old onarim.spec.ts and
 * field-execution.spec.ts, whose flows died with the rebuild (audit §E.3 + decision D3b):
 *   - outcome coloring needed seeded visit realizations; no bridge loads realizations anymore
 *     and the FieldExecutionSeederModule was deleted (D3b), so there is nothing to assert;
 *   - the Onarım workbench opens only from disruption issues (leave/closed), which exist only
 *     in the engine's mock people data that the backend load replaces — the backend Onarım
 *     chain has no panel bridge yet (audit §A3.2, decision still open).
 * What IS real and covered here: the Saha tab renders backend notes (notesBridge persists
 * "Çözüldü" via PATCH /notes/{id}) and the Sorunlar tab renders validation issues computed
 * from the real loaded plan.
 */
test('inbox: Saha tab renders (resolving a note persists), Sorunlar tab shows plan issues', async ({ page }) => {
  await login(page)
  await openPlanner(page)

  await page.click('#inboxBtn')
  await expect(page.locator('.page.on .page-top .ttl')).toHaveText('Gelen kutusu')

  // Saha tab (default): with an unseeded DB there may be zero notes — the explanatory footer
  // always renders. If an open note is present, resolve it and assert the PATCH goes out.
  await expect(page.locator('#inboxBody')).toContainText('Saha temsilcileri not/talep yazabilir')
  const resolve = page.locator('#inboxBody .doneBtn').first()
  if (await resolve.isVisible().catch(() => false)) {
    const patch = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().includes('/api/v1/notes/'))
    await resolve.click()
    await patch
  }

  // Sorunlar tab: issues recomputed from the real loaded plan — either issue rows or the
  // explicit clean-plan message must render (an empty pane means the tab is broken).
  await page.locator('#inboxTabs div[data-t=issues]').click()
  const issues = page.locator('#inboxBody')
  await expect(issues.locator('.cc-item').first().or(issues.getByText('Sorun yok — plan temiz'))).toBeVisible()

  await page.screenshot({ path: 'e2e/artifacts/inbox.png' })
})

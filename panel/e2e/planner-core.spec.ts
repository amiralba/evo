import { expect, test } from '@playwright/test'
import { confirmPublish, login, openPlanner } from './helpers'

/**
 * The core planner loop against the hosted v0.5 prototype, end-to-end REAL: create a route
 * (Yeni rut draft → pool-pick a store → assign a person → Aktifleştir), publish it (Yayınla →
 * publishBridge writes createRoute/bulkAddStops/reassign/publish to the backend), and see the
 * round-trip — after publish the bridge reloads backend state, so the new route code showing in
 * the rail proves it was actually persisted, not just buffered in the prototype's changes[].
 *
 * Self-sufficient by design: the seeder does NOT seed routes (decision D3b) — the spec creates
 * everything it needs. It does require ≥1 unassigned store in the default province (seeded).
 */
test('planner core: create a route from the pool, activate, publish, survive the backend round-trip', async ({ page }) => {
  await login(page)
  await openPlanner(page)

  // 1. Yeni rut — capture the auto route code shown in the identity modal (e.g. ANK-03).
  await page.locator('#railList').getByText('+ Yeni rut').click()
  const modal = page.locator('#nrModal')
  await expect(modal).toBeVisible()
  const routeCode = (await modal.locator('.frow b').first().innerText()).trim()
  expect(routeCode).toMatch(/-\d+$/)
  await modal.locator('#nrName').fill(`E2E Rut ${Date.now()}`)
  await modal.locator('#nrGo').click()

  // 2. Draft mode: add one store via the pool picker (the list alternative to the map lasso).
  await page.getByRole('button', { name: /Havuzdan listeyle ekle/ }).click()
  const picker = page.locator('#ppModal')
  await expect(picker).toBeVisible()
  const firstAdd = picker.locator('.ppAdd').first()
  await expect(firstAdd, 'pool has no unassigned store in this province — seed or free one up').toBeVisible({
    timeout: 10_000,
  })
  await firstAdd.click()
  await picker.getByRole('button', { name: 'Bitti' }).click()

  // 3. Assign a person (first real candidate) — required before Aktifleştir.
  const personSelect = page.locator('#panelBody select')
  await expect(personSelect).toBeVisible()
  const firstPerson = await personSelect.locator('option').nth(1).getAttribute('value')
  await personSelect.selectOption(firstPerson!)

  // 4. Activate the draft — this buffers the change, enabling Yayınla.
  await page.getByRole('button', { name: 'Aktifleştir', exact: true }).click()
  await expect(page.locator('#chgCount')).not.toHaveText('0')

  // 5. Publish and wait for the backend write confirmation toast from publishBridge.
  await confirmPublish(page)
  await expect(page.locator('#toast')).toContainText(/Backend.e yazıldı/, { timeout: 30_000 })

  // 6. Round-trip: the bridge reloads backend state after the flush; the new route must come
  // back from the API (rail lists only backend routes after a load).
  await expect(page.locator('#railList')).toContainText(routeCode, { timeout: 30_000 })

  await page.screenshot({ path: 'e2e/artifacts/planner-core.png' })

  // 7. Cleanup — keep the suite rerunnable on the small seeded pool: deactivating the route
  // returns its store to the pool (engine semantics), and publishing persists both (route
  // status + stop removal). The engine call replaces the focus-the-route UI dance; the write
  // path exercised is the same publish flow.
  await page.evaluate((code) => {
    const w = window as unknown as {
      __evoState: () => { routes: Array<{ id: string; code?: string | null }> }
      deactivateRoute: (id: string) => void
      confirm: (msg?: string) => boolean
    }
    const orig = w.confirm
    w.confirm = () => true
    try {
      const r = w.__evoState().routes.find((x) => x.code === code)
      if (r) w.deactivateRoute(r.id)
    } finally {
      w.confirm = orig
    }
  }, routeCode)
  await confirmPublish(page)
  // Inactive routes are skipped by the rail render — the code disappearing after the reload
  // proves the deactivation reached the backend and came back.
  await expect(page.locator('#railList')).not.toContainText(routeCode, { timeout: 30_000 })
})

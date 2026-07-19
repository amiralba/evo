import * as planner from '../../api/planner'
import { registerAfterPanel } from './afterPanel'

/**
 * Backs the store Görevler (tasks) tab with real data. The prototype's own task tab is driven by
 * the now-cleared mock taskTemplates; instead, after renderPanel paints (window.__evoAfterPanel,
 * installed by engine.js's wrapper), if a store is focused on the tasks tab we swap the panel body
 * for the resolved tasks from GET /stores/{id}/task-plan — name · minutes · rule source · done.
 */

interface TaskRow {
  name: string
  minutes: number
  source: string
  done: boolean
}

// Rule-resolution trace layer -> short Turkish source tag (matches the design's source chain).
// Backend layer strings vary ("template default", "Format", "Store rule", …) so match loosely.
function sourceLabel(layerRaw: string): string {
  const l = layerRaw.toLowerCase()
  if (l.includes('format')) return 'tip'
  if (l.includes('chain')) return 'zincir'
  if (l.includes('route') || l.includes('rut')) return 'rut'
  if (l.includes('store') || l.includes('mağaza')) return 'mağaza'
  if (l.includes('manual') || l.includes('instance') || l.includes('override')) return 'elle'
  return 'şablon'
}

const cache: Record<string, TaskRow[] | undefined> = {}
const inflight: Record<string, boolean> = {}

interface EvoState {
  focus: { type: string; id?: string } | null
  panelTab: string
}
type TasksWindow = Window & {
  __evoState?: () => EvoState
  __evoStoreTasks?: Record<string, TaskRow[] | undefined>
  __evoAfterPanel?: () => void
  __evoRenderAll?: () => void
}

/** Monday of the current planning week (kept in sync with backendBridge.planningWeek). */
function planningMonday(): string {
  const now = new Date()
  const g = now.getDay()
  const offset = g === 0 ? 1 : g === 6 ? 2 : 1 - g
  const mon = new Date(now)
  mon.setDate(now.getDate() + offset)
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

async function ensureStoreTasks(storeId: string): Promise<void> {
  if (cache[storeId] !== undefined || inflight[storeId]) return
  inflight[storeId] = true
  try {
    const plan = await planner.getStoreTaskPlan(storeId, planningMonday())
    cache[storeId] = (plan.tasks ?? []).map((t) => {
      const trace = t.trace ?? []
      const layer = trace.length ? (trace[trace.length - 1].layer ?? '') : ''
      return {
        name: t.name ?? '',
        minutes: t.minutes ?? 0,
        source: sourceLabel(layer),
        done: t.status === 3,
      }
    })
  } catch {
    cache[storeId] = []
  } finally {
    inflight[storeId] = false
  }
  ;(window as TasksWindow).__evoRenderAll?.()
}

function renderTasksHtml(rows: TaskRow[]): string {
  if (!rows.length) return '<div class="empty">Bu mağaza için görev bulunamadı.</div>'
  const total = rows.reduce((a, r) => a + r.minutes, 0)
  const items = rows
    .map(
      (r) =>
        `<div class="task-row"><span>${r.done ? '✓ ' : ''}${escapeHtml(r.name)}</span>` +
        `<span>${r.minutes}dk <span class="src">${escapeHtml(r.source)}</span></span></div>`,
    )
    .join('')
  return (
    items +
    `<div style="color:var(--tx2);font-size:11px;margin-top:8px;">Ziyaret toplamı: <b>${total}dk</b> · süreler kurallarla çözülür (backend)</div>`
  )
}

export function installTasksBridge(): void {
  const w = window as TasksWindow
  w.__evoStoreTasks = cache
  registerAfterPanel(() => {
    const st = w.__evoState?.()
    if (!st || !st.focus || st.focus.type !== 'store' || st.panelTab !== 'tasks' || !st.focus.id) return
    const body = document.getElementById('panelBody')
    if (!body) return
    const sid = st.focus.id
    const rows = cache[sid]
    if (rows === undefined) {
      body.innerHTML = '<div class="empty">Görevler yükleniyor…</div>'
      void ensureStoreTasks(sid)
      return
    }
    body.innerHTML = renderTasksHtml(rows)
  })
}

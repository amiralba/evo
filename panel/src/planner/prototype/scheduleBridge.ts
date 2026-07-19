import { registerAfterPanel } from './afterPanel'

/**
 * L4 (schedule presence): a weekday-days editor on a routed store's Bilgi tab. A stop stays ON the
 * route (L3) but is only VISITED on the checked weekdays — "3 days a week", or zero days (removed
 * from the schedule without leaving the route). Maps to RouteStop.Frequency=Weekly + WeekdayMask
 * (bit0=Mon … bit4=Fri; Daily ignores the mask, so editing days switches the stop to Weekly).
 * Buffered like every schedule effect; committed via updateStop on Yayınla (see publishBridge).
 */

interface SchedStore {
  id: string
  name?: string | null
  stopId?: string | null
  freqNum?: number | null
  weekdayMask?: number | null
  route?: string | null
}
interface SchedState {
  focus: { type: string; id?: string } | null
  panelTab: string
  stores: SchedStore[]
}
type SchedWindow = Window & {
  __evoState?: () => SchedState
  logChange?: (desc: string, pid: unknown, day: unknown, undo: () => void, patch?: boolean) => void
}

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum']

/** Daily stops visit every weekday, so show them as all-5-on; otherwise use the stored mask. */
function maskFor(s: SchedStore): number {
  return s.freqNum === 1 ? 31 : (s.weekdayMask ?? 0)
}

function editorHtml(store: SchedStore): string {
  const mask = maskFor(store)
  const chips = DAYS.map((d, i) => {
    const on = (mask & (1 << i)) !== 0
    return (
      `<span class="evo-sched-day" data-day="${i}" style="cursor:pointer;user-select:none;padding:3px 9px;` +
      `border-radius:6px;font-size:11px;border:1px solid ${on ? 'var(--blue-d)' : 'var(--border2)'};` +
      `background:${on ? 'var(--blue-l)' : 'var(--card)'};color:${on ? 'var(--blue-d)' : 'var(--tx2)'};">${d}</span>`
    )
  }).join('')
  const n = DAYS.filter((_, i) => (mask & (1 << i)) !== 0).length
  return (
    `<div id="evoSchedEditor" style="margin-top:12px;border-top:1px solid var(--gray-l);padding-top:8px;">` +
    `<div style="font-size:11px;font-weight:600;margin-bottom:6px;">Ziyaret günleri · programda (${n}/5)</div>` +
    `<div style="display:flex;gap:4px;flex-wrap:wrap;">${chips}</div>` +
    `<div style="font-size:10.5px;color:var(--tx3);margin-top:6px;">Gün ekle/çıkar = programa ekle/çıkar. ` +
    `Mağaza rutta kalır — yalnızca seçili günlerde ziyaret edilir. Yayınla ile sahaya gider.</div></div>`
  )
}

function wire(body: HTMLElement, store: SchedStore): void {
  body.querySelectorAll<HTMLElement>('.evo-sched-day').forEach((el) => {
    el.onclick = () => {
      const w = window as SchedWindow
      const i = Number(el.dataset.day)
      const prevMask = store.weekdayMask ?? null
      const prevFreq = store.freqNum ?? null
      const mask = maskFor(store) ^ (1 << i)
      store.freqNum = 2 // Weekly — the mask now drives which days are visited
      store.weekdayMask = mask
      const days = DAYS.filter((_, k) => (mask & (1 << k)) !== 0).join(', ') || 'yok'
      // logChange records it (Yayınla count + undo) and re-renders, which re-runs this editor.
      w.logChange?.(`${store.name}: ziyaret günleri → ${days}`, null, null, () => {
        store.weekdayMask = prevMask
        store.freqNum = prevFreq
      })
    }
  })
}

export function installScheduleBridge(): void {
  registerAfterPanel(() => {
    const st = (window as SchedWindow).__evoState?.()
    if (!st || !st.focus || st.focus.type !== 'store' || st.panelTab !== 'info' || !st.focus.id) return
    const store = st.stores.find((x) => x.id === st.focus!.id)
    if (!store || !store.stopId) return // only routed stores have a schedule
    const body = document.getElementById('panelBody')
    if (!body || document.getElementById('evoSchedEditor')) return
    body.insertAdjacentHTML('beforeend', editorHtml(store))
    wire(body, store)
  })
}

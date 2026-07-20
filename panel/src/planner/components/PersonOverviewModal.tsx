import { useCallback, useEffect, useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import multiMonthPlugin from '@fullcalendar/multimonth'
import trLocale from '@fullcalendar/core/locales/tr'
import type { EventInput } from '@fullcalendar/core'

/**
 * Aylık genel bakış: a read-only multi-month projection of ONE merchandiser's schedule.
 *
 * The prototype's calendar is a weekly pattern (Pzt–Cum, minutes-of-day); this modal expands the
 * person's CURRENT effective week forward over the horizon and renders it with FullCalendar's
 * multiMonth grid (MIT tier — no resources, single person). It is a projection of the current
 * weekly pattern, not the resolved baseline ⊕ patch timeline per future week — patches with
 * expiries are not modeled here, and the modal says so.
 *
 * Opened from the person row in the TAKVİM pane via window.__evoPersonOverview (anchored injection
 * in extract-prototype.mjs); reads engine state through the existing __evoState/__evoSnapshot
 * read-only hooks, mutates nothing.
 */

const HORIZON_WEEKS = 14 // ~3 months of Mondays
const MONTHS_SHOWN = 3

interface ProtoVisit {
  storeId: string
  personId: string
  day: number // 0=Pzt … 4=Cum
  start: number // minutes from midnight
  dur: number
}
interface ProtoPerson {
  id: string
  name?: string
}
interface ProtoStore {
  id: string
  name?: string
  cat?: string // P=Potansiyel V=Değerli S=Servis
}
interface OverviewWindow {
  __evoState?: () => { visits: ProtoVisit[]; people: ProtoPerson[]; stores: ProtoStore[] }
  __evoSnapshot?: { weekFrom?: string | null }
  __evoPersonOverview?: (personId: string) => void
}

/* Prototype vblock palette (proto.css .vblock.catP/.catV/.catS) so the months read the same
 * as the week grid. */
const CAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  P: { bg: '#DFF5EC', text: '#0E6B4F', border: '#9FE1CB' },
  V: { bg: '#FAEEDA', text: '#854F0B', border: '#FAC775' },
  S: { bg: '#EFEEE9', text: '#66645C', border: '#DDDBD2' },
}

function mondayOf(iso: string | null | undefined): Date {
  if (iso) {
    const d = new Date(`${iso}T00:00:00`)
    if (!Number.isNaN(d.getTime())) return d
  }
  const now = new Date()
  const day = (now.getDay() + 6) % 7 // Mon=0
  now.setDate(now.getDate() - day)
  now.setHours(0, 0, 0, 0)
  return now
}

function buildEvents(personId: string): { events: EventInput[]; personName: string; weekFrom: Date } {
  const w = window as unknown as OverviewWindow
  const s = w.__evoState?.()
  const weekFrom = mondayOf(w.__evoSnapshot?.weekFrom)
  if (!s) return { events: [], personName: '', weekFrom }
  const person = s.people.find((p) => p.id === personId)
  const visits = s.visits.filter((v) => v.personId === personId)
  const events: EventInput[] = []
  for (let wk = 0; wk < HORIZON_WEEKS; wk++) {
    for (const v of visits) {
      const st = s.stores.find((x) => x.id === v.storeId)
      const day = new Date(weekFrom)
      day.setDate(day.getDate() + wk * 7 + v.day)
      const start = new Date(day)
      start.setMinutes(v.start)
      const end = new Date(day)
      end.setMinutes(v.start + v.dur)
      const c = CAT_COLORS[st?.cat ?? 'S'] ?? CAT_COLORS.S
      events.push({
        title: st?.name ?? v.storeId,
        start,
        end,
        backgroundColor: c.bg,
        textColor: c.text,
        borderColor: c.border,
      })
    }
  }
  return { events, personName: person?.name ?? '', weekFrom }
}

export function PersonOverviewModal() {
  const [personId, setPersonId] = useState<string | null>(null)

  useEffect(() => {
    const w = window as unknown as OverviewWindow
    w.__evoPersonOverview = (id: string) => setPersonId(id)
    return () => {
      delete w.__evoPersonOverview
    }
  }, [])

  const close = useCallback(() => setPersonId(null), [])

  useEffect(() => {
    if (!personId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [personId, close])

  const data = useMemo(() => (personId ? buildEvents(personId) : null), [personId])
  if (!personId || !data) return null

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(30,29,24,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          borderRadius: 12,
          boxShadow: '0 18px 50px rgba(0,0,0,.28)',
          width: 'min(1180px, 96vw)',
          height: 'min(760px, 92vh)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          font: "13px -apple-system,'Segoe UI',Roboto,sans-serif",
          color: '#33322C',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            padding: '14px 18px 10px',
            borderBottom: '1px solid #E8E6DE',
          }}
        >
          <b style={{ fontSize: 15 }}>{data.personName || 'Saha temsilcisi'}</b>
          <span style={{ color: '#66645C' }}>— {MONTHS_SHOWN} aylık genel bakış</span>
          <span style={{ color: '#98968D', fontSize: 11 }}>
            mevcut haftalık düzenin projeksiyonu · yama/istisna içermez
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ display: 'inline-flex', gap: 10, fontSize: 11, color: '#66645C' }}>
            {(['P', 'V', 'S'] as const).map((c) => (
              <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: CAT_COLORS[c].bg,
                    border: `1px solid ${CAT_COLORS[c].border}`,
                  }}
                />
                {c === 'P' ? 'Potansiyel' : c === 'V' ? 'Değerli' : 'Servis'}
              </span>
            ))}
          </span>
          <button
            onClick={close}
            aria-label="Kapat"
            style={{
              border: '1px solid #DDDBD2',
              background: '#FAFAF7',
              borderRadius: 6,
              padding: '3px 10px',
              cursor: 'pointer',
              fontSize: 13,
              color: '#33322C',
            }}
          >
            ✕ Kapat
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: '10px 14px 14px' }}>
          <FullCalendar
            plugins={[multiMonthPlugin]}
            initialView="evoMultiMonth"
            views={{ evoMultiMonth: { type: 'multiMonth', duration: { months: MONTHS_SHOWN } } }}
            initialDate={data.weekFrom}
            events={data.events}
            locale={trLocale}
            headerToolbar={{ left: 'title', center: '', right: 'prev,next' }}
            height="100%"
            multiMonthMaxColumns={3}
            multiMonthMinWidth={300}
            aspectRatio={0.95}
            dayMaxEvents={3}
            eventDisplay="block"
            displayEventTime={false}
            editable={false}
            selectable={false}
            weekends={false}
            firstDay={1}
          />
        </div>
      </div>
    </div>
  )
}

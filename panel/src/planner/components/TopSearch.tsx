import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../state/workspaceStore'
import { useRoutes, useStoresGeo, useMerchandisers } from '../api/queries'

interface SearchResult {
  kind: 'store' | 'route' | 'person'
  id: string
  label: string
  sub: string
}

/** Global search (prototype #globalSearch, evo-planner-prototype-v0.5.html:2494-2528) — searches
 * routes/stores/merchandisers already loaded for the current province, live dropdown, Enter picks
 * the first result, `/` or ⌘K/Ctrl+K focuses the box from anywhere (unless already typing). */
export function TopSearch() {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const focusRoute = useWorkspaceStore((s) => s.focusRoute)
  const focusStore = useWorkspaceStore((s) => s.focusStore)
  const { data: routesPage } = useRoutes(province)
  const { data: stores } = useStoresGeo(province)
  const { data: merchandisers } = useMerchandisers(true)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        return
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        const target = e.target as HTMLElement
        const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
        if (!typing) {
          e.preventDefault()
          inputRef.current?.focus()
          inputRef.current?.select()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const out: SearchResult[] = []
    for (const s of stores ?? []) {
      if (s.id && s.name?.toLowerCase().includes(q)) {
        out.push({ kind: 'store', id: s.id, label: s.name, sub: s.activeRouteCode ?? t('planner.pool', 'Havuz') })
      }
    }
    for (const r of routesPage?.items ?? []) {
      if (r.id && `${r.routeCode} ${r.name}`.toLowerCase().includes(q)) {
        out.push({ kind: 'route', id: r.id, label: `${r.routeCode} · ${r.name}`, sub: r.merchandiserName ?? t('planner.railNoPerson', 'kişi yok') })
      }
    }
    for (const m of merchandisers ?? []) {
      if (m.id && m.name?.toLowerCase().includes(q)) {
        out.push({ kind: 'person', id: m.id, label: m.name, sub: t('planner.searchPerson', 'saha temsilcisi') })
      }
    }
    return out.slice(0, 8)
  }, [query, stores, routesPage, merchandisers, t])

  function pick(result: SearchResult) {
    setOpen(false)
    setQuery('')
    if (result.kind === 'store') focusStore(result.id)
    else if (result.kind === 'route') focusRoute(result.id)
    // person: no dedicated person-focus context yet — route/store focus covers the panel's real
    // detail types (gap-matrix §6); leaving this a no-navigation result rather than a fake one.
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        placeholder={t('planner.searchPlaceholder', '🔍 ara…  ( / veya ⌘K )')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) pick(results[0])
          if (e.key === 'Escape') inputRef.current?.blur()
        }}
        style={{ border: '1px solid var(--border2)', borderRadius: 6, padding: '4px 10px', fontSize: 12, width: 190, background: 'var(--card)', color: 'var(--tx)' }}
      />
      {open && query.trim().length >= 2 && (
        <div
          style={{
            display: 'block',
            position: 'absolute',
            top: 28,
            left: 0,
            width: 250,
            background: 'var(--card)',
            border: '1px solid var(--border2)',
            borderRadius: 8,
            boxShadow: '0 6px 18px rgba(0,0,0,.15)',
            zIndex: 70,
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {results.length === 0 && <div style={{ padding: 10, color: 'var(--tx3)', fontSize: 12 }}>{t('planner.searchNoResults', 'Sonuç yok')}</div>}
          {results.map((r) => (
            <div
              key={`${r.kind}-${r.id}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
              style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid var(--gray-l)', fontSize: 12 }}
            >
              <b>{r.label}</b>
              <br />
              <span style={{ color: 'var(--tx3)', fontSize: 11 }}>{r.sub}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

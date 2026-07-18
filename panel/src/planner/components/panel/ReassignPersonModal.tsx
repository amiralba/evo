import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMerchandisers } from '../../api/queries'
import { useReassignRoute } from '../../api/mutations'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { spacing, colors } from '../../../theme/tokens'
import type { components } from '../../../api/generated/schema'

type AssignmentReason = components['schemas']['AssignmentReason']

interface ReassignPersonModalProps {
  routeId: string
  routeCode: string
  currentMerchandiserName: string | null
  onClose: () => void
}

const REASON_OPTIONS: { value: AssignmentReason; label: string }[] = [
  { value: 1, label: 'Yeni işe alım' },
  { value: 2, label: 'İstifa / işten ayrılma' },
  { value: 3, label: 'Rotalar arası takas' },
  { value: 4, label: 'Geçici kapsama' },
  { value: 5, label: 'Yeniden yapılanma' },
]

/** Kişi değiştir (prototype openPersonPicker, evo-planner-prototype-v0.5.html:744-793) — searchable
 * merchandiser list + mandatory reason (feeds turnover/stability analytics — design §2.4). Busy
 * merchandisers (already holding another active assignment) show disabled, matching the prototype's
 * "double assignment is DB-impossible" framing. Backend endpoint already existed (spec 005); this
 * was the missing panel modal (gap-matrix §3). */
export function ReassignPersonModal({ routeId, routeCode, currentMerchandiserName, onClose }: ReassignPersonModalProps) {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const { data: merchandisers, isLoading } = useMerchandisers(true)
  const reassign = useReassignRoute(routeId, province)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reason, setReason] = useState<AssignmentReason | ''>('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (merchandisers ?? []).filter((m) => !q || (m.name ?? '').toLowerCase().includes(q))
  }, [merchandisers, search])

  function handleSelect(id: string, busy: boolean) {
    if (busy) return
    setSelectedId(id)
  }

  function handleCommit() {
    if (!selectedId || !reason) return
    reassign.mutate(
      { merchandiserId: selectedId, startDate: new Date().toISOString().slice(0, 10) as string, reason },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="modal-bg">
      <div className="modal" style={{ width: 400 }}>
        <div className="modal-head">
          {t('planner.reassignPerson', 'Kişi değiştir')} — {routeCode}{' '}
          <span style={{ fontSize: 11, color: colors.text3, fontWeight: 400 }}>
            {t('planner.reassignCurrently', 'şu an')}: {currentMerchandiserName ?? t('planner.unassigned', 'kimse')}
          </span>
        </div>
        <div className="modal-body">
          <input
            type="text"
            placeholder={t('planner.reassignSearch', '🔍 kişi ara…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', border: `1px solid ${colors.border2}`, borderRadius: 6, padding: '5px 9px', fontSize: 12, marginBottom: 8, background: colors.card, color: colors.text, boxSizing: 'border-box' }}
          />

          {isLoading && <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>}

          <div>
            {filtered.length === 0 && !isLoading && <div className="empty">{t('planner.reassignNone', 'Kişi yok')}</div>}
            {filtered.map((m) => {
              const busy = Boolean(m.activeRouteCode) && m.activeRouteCode !== routeCode
              const selected = selectedId === m.id
              return (
                <div
                  key={m.id}
                  onClick={() => m.id && handleSelect(m.id, busy)}
                  style={{
                    padding: '5px 8px',
                    border: `1px solid ${selected ? colors.blueDark : colors.grayLight}`,
                    borderRadius: 5,
                    marginBottom: 3,
                    fontSize: 11.5,
                    display: 'flex',
                    justifyContent: 'space-between',
                    opacity: busy ? 0.45 : 1,
                    cursor: busy ? 'default' : 'pointer',
                    background: selected ? colors.blueLight : undefined,
                  }}
                >
                  <span>
                    <b>{m.name}</b>
                  </span>
                  <span style={{ color: colors.text3 }}>
                    {busy ? `${t('planner.reassignBusy', 'meşgul')}: ${m.activeRouteCode}` : t('planner.reassignAvailable', 'uygun · seç')}
                  </span>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: spacing.lg }}>
            <label style={{ fontSize: 12 }}>{t('planner.reassignReason', 'Sebep (zorunlu)')}</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value ? (Number(e.target.value) as AssignmentReason) : '')}
              style={{ flex: 1 }}
            >
              <option value="">{t('planner.reassignChoose', 'seç…')}</option>
              {REASON_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: 10.5, color: colors.text3, marginTop: 6 }}>
            {t('planner.reassignFooter', 'Sebep, atama geçmişine yazılır — devir/stabilite analitiği buradan beslenir.')}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" onClick={onClose}>
            {t('common.cancel', 'Vazgeç')}
          </button>
          <button type="button" className="primary" disabled={!selectedId || !reason || reassign.isPending} onClick={handleCommit}>
            {t('common.save', 'Kaydet')}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAffectedVisits, useDisruptions } from './api/queries'
import { useApplyOnarim } from './api/mutations'
import { clearDecision, isRowDecisionComplete, setDecision, undecidedVisitIds, type DecisionState, type RowDecision } from './decisionState'
import { formatMinutes } from '../planner/format'
import type { components } from '../api/generated/schema'

type AffectedVisitDto = components['schemas']['AffectedVisitDto']

interface OnarimWorkbenchProps {
  onClose: () => void
  initialDisruptionId?: string
}

const ACTION_LABEL: Record<number, string> = {
  1: 'Atla',
  2: 'Gün değiştir',
  3: 'Rotayı devret',
  4: 'Kişiye devret',
}

export function OnarimWorkbench({ onClose, initialDisruptionId }: OnarimWorkbenchProps) {
  const { t } = useTranslation()
  const { data: disruptions, isLoading: loadingDisruptions } = useDisruptions()
  const [disruptionId, setDisruptionId] = useState<string | null>(initialDisruptionId ?? null)
  const { data: affected, isLoading: loadingAffected } = useAffectedVisits(disruptionId)
  const [decisions, setDecisions] = useState<DecisionState>({})
  const [reason, setReason] = useState('')
  const [objective, setObjective] = useState('')
  const apply = useApplyOnarim(disruptionId ?? '')

  if (!disruptionId) {
    return (
      <div className="modal-bg">
        <div className="modal">
          <div className="modal-head">{t('onarim.title', 'Onarım')}</div>
          <div className="modal-body">
            {loadingDisruptions && <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>}
            {!loadingDisruptions && (disruptions ?? []).length === 0 && (
              <div className="empty">{t('onarim.noDisruptions', 'Açık aksaklık yok.')}</div>
            )}
            {(disruptions ?? []).map((d) => (
              <div
                key={d.id}
                className="hist-item"
                style={{ cursor: 'pointer' }}
                onClick={() => setDisruptionId(d.id!)}
                data-testid="disruption-row"
              >
                <div className="d">
                  {d.kind === 'Absence' ? t('onarim.kindAbsence', 'İzin') : t('onarim.kindClosure', 'Mağaza Kapalı')} ·{' '}
                  {d.start} → {d.end}
                </div>
                <div>
                  {d.label} — {t('onarim.affectedVisits', '{{count}} etkilenen ziyaret', { count: d.affectedVisitCount ?? 0 })}
                </div>
              </div>
            ))}
          </div>
          <div className="modal-foot">
            <button type="button" className="primary" onClick={onClose}>
              {t('common.close', 'Kapat')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const rows = affected ?? []
  const allApplied = apply.isSuccess
  const undecided = undecidedVisitIds(decisions, rows.map((r) => r.plannedVisitId!))
  const overrideReady = reason.trim().length > 0 && objective.trim().length > 0
  const canApply = rows.length > 0 && undecided.length === 0 && overrideReady

  function updateDecision(visitId: string, decision: RowDecision | null) {
    setDecisions((prev) => (decision ? setDecision(prev, visitId, decision) : clearDecision(prev, visitId)))
  }

  function handleApply() {
    apply.mutate({
      reason,
      objective,
      decisions: rows.map((r) => ({ plannedVisitId: r.plannedVisitId!, ...decisions[r.plannedVisitId!] })),
    })
  }

  return (
    <div className="modal-bg">
      <div className="modal">
        <div className="modal-head">{t('onarim.title', 'Onarım')}</div>
        <div className="modal-body">
          {loadingAffected && <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>}
          {!loadingAffected && rows.length === 0 && <div className="empty">{t('onarim.noAffectedVisits', 'Etkilenen ziyaret yok.')}</div>}

          {!allApplied &&
            rows.map((row) => (
              <VisitRow
                key={row.plannedVisitId}
                row={row}
                decision={decisions[row.plannedVisitId!]}
                onChange={(d) => updateDecision(row.plannedVisitId!, d)}
              />
            ))}

          {!allApplied && rows.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label>
                {t('planner.reason', 'Neden')} *
                <textarea className="pub-textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <label>
                {t('planner.objective', 'Amaç')} *
                <textarea className="pub-textarea" value={objective} onChange={(e) => setObjective(e.target.value)} />
              </label>
            </div>
          )}

          {allApplied && <div>{t('onarim.applied', 'Onarım uygulandı.')}</div>}
        </div>
        <div className="modal-foot">
          {!allApplied ? (
            <>
              <button type="button" onClick={onClose}>
                {t('common.cancel', 'Vazgeç')}
              </button>
              <button
                type="button"
                className="primary"
                data-testid="onarim-apply"
                onClick={handleApply}
                disabled={!canApply || apply.isPending}
              >
                {t('common.apply', 'Uygula')}
              </button>
            </>
          ) : (
            <button type="button" className="primary" onClick={onClose}>
              {t('common.close', 'Kapat')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface VisitRowProps {
  row: AffectedVisitDto
  decision: RowDecision | undefined
  onChange: (decision: RowDecision | null) => void
}

function VisitRow({ row, decision, onChange }: VisitRowProps) {
  const { t } = useTranslation()
  const complete = decision ? isRowDecisionComplete(decision) : false

  return (
    <div className="hist-item" data-testid="affected-visit-row" style={{ opacity: complete ? 1 : 0.85 }}>
      <div className="d">
        {row.routeCode} — {row.storeName} — {row.date} ({formatMinutes(row.plannedMinutes ?? 0)})
        {!complete && <span style={{ marginLeft: 6 }}>🔴</span>}
      </div>

      <select
        value={decision?.action ?? ''}
        onChange={(e) => {
          const action = Number(e.target.value) as RowDecision['action']
          if (!action) {
            onChange(null)
            return
          }
          onChange({ action })
        }}
      >
        <option value="">{t('onarim.chooseAction', 'Eylem seçin')}</option>
        <option value={1}>{ACTION_LABEL[1]}</option>
        <option value={2}>{ACTION_LABEL[2]}</option>
        <option value={3}>{ACTION_LABEL[3]}</option>
        <option value={4}>{ACTION_LABEL[4]}</option>
      </select>

      {decision?.action === 2 && (
        <input
          type="date"
          value={decision.targetDate ?? ''}
          onChange={(e) => onChange({ ...decision, targetDate: e.target.value })}
          style={{ marginLeft: 6 }}
        />
      )}

      {decision?.action === 3 && (
        <select
          value={decision.targetMerchandiserId ?? ''}
          onChange={(e) => onChange({ ...decision, targetMerchandiserId: e.target.value })}
          style={{ marginLeft: 6 }}
        >
          <option value="">{t('onarim.chooseCandidate', 'Aday seçin')}</option>
          {(row.candidates ?? []).map((c) => (
            <option key={c.merchandiserId} value={c.merchandiserId}>
              {c.name} — {c.reasoning}
            </option>
          ))}
        </select>
      )}

      {decision?.action === 4 && (
        <select
          value={decision.targetMerchandiserId ?? ''}
          onChange={(e) => {
            const candidate = (row.candidates ?? []).find((c) => c.merchandiserId === e.target.value)
            onChange({ ...decision, targetMerchandiserId: candidate?.merchandiserId, targetRouteId: candidate?.routeId ?? undefined })
          }}
          style={{ marginLeft: 6 }}
        >
          <option value="">{t('onarim.chooseCandidate', 'Aday seçin')}</option>
          {(row.candidates ?? [])
            .filter((c) => c.routeId)
            .map((c) => (
              <option key={c.merchandiserId} value={c.merchandiserId}>
                {c.name} {c.available ? '✓' : '✗'} — {c.reasoning}
              </option>
            ))}
        </select>
      )}
    </div>
  )
}

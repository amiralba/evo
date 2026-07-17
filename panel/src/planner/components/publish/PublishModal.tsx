import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { usePublish } from '../../api/mutations'
import * as planner from '../../../api/planner'
import { colors, spacing, radius, fontSize, severityColors } from '../../../theme/tokens'
import type { components } from '../../../api/generated/schema'

type FindingDto = components['schemas']['FindingDto']

interface PublishModalProps {
  routeId: string
  onClose: () => void
}

export function PublishModal({ routeId, onClose }: PublishModalProps) {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const [findings, setFindings] = useState<FindingDto[] | null>(null)
  const [reason, setReason] = useState('')
  const [objective, setObjective] = useState('')
  const publish = usePublish(routeId, province)
  const loadingFindings = findings === null

  useEffect(() => {
    let cancelled = false
    planner.validateRoute(routeId).then((f) => {
      if (!cancelled) setFindings(f)
    })
    return () => {
      cancelled = true
    }
  }, [routeId])

  const errors = (findings ?? []).filter((f) => f.severity === 1)
  const warnings = (findings ?? []).filter((f) => f.severity === 2)
  const needsOverride = errors.length > 0
  const overrideReady = reason.trim().length > 0 && objective.trim().length > 0

  function handlePublish() {
    publish.mutate({ reason: needsOverride ? reason : null, objective: needsOverride ? objective : null })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: colors.card,
          borderRadius: radius.card,
          padding: spacing.xxl,
          width: 420,
          maxHeight: '80vh',
          overflowY: 'auto',
          fontSize: fontSize.md,
        }}
      >
        <h3 style={{ marginTop: 0 }}>{t('planner.publishReview', 'Yayın öncesi inceleme')}</h3>

        {loadingFindings && <div>{t('common.loading', 'Yükleniyor…')}</div>}

        {!loadingFindings && !publish.isSuccess && (
          <>
            {errors.length === 0 && warnings.length === 0 && (
              <div style={{ color: colors.tealDark }}>{t('planner.noFindings', 'Doğrulama bulgusu yok.')}</div>
            )}
            {errors.map((f, i) => (
              <div key={`e${i}`} style={{ padding: `${spacing.sm} 0`, color: severityColors.err.fg }}>
                🔴 {f.code} — {f.message}
              </div>
            ))}
            {warnings.map((f, i) => (
              <div key={`w${i}`} style={{ padding: `${spacing.sm} 0`, color: severityColors.warn.fg }}>
                🟡 {f.code} — {f.message}
              </div>
            ))}

            {needsOverride && (
              <div style={{ marginTop: spacing.lg, display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
                <label>
                  {t('planner.reason', 'Neden')} *
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%' }} />
                </label>
                <label>
                  {t('planner.objective', 'Amaç')} *
                  <textarea value={objective} onChange={(e) => setObjective(e.target.value)} style={{ width: '100%' }} />
                </label>
              </div>
            )}

            <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.xl }}>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publish.isPending || (needsOverride && !overrideReady)}
                style={{ borderRadius: radius.md, background: colors.blue, color: 'white', border: 'none', padding: `${spacing.sm} ${spacing.lg}` }}
              >
                {t('common.publish', 'Yayınla')}
              </button>
              <button type="button" onClick={onClose}>
                {t('common.cancel', 'Vazgeç')}
              </button>
            </div>
          </>
        )}

        {publish.isSuccess && (
          <div>
            <div style={{ color: colors.tealDark, fontSize: fontSize.md }}>
              {t('planner.visitsMaterialized', 'Oluşturulan ziyaret sayısı')}: {publish.data.visitsMaterialized}
            </div>
            {publish.data.overrodeErrors && (
              <div style={{ marginTop: spacing.sm }}>
                {t('planner.decisionRecorded', 'Karar kaydedildi')}: {publish.data.decisionJournalId}
              </div>
            )}
            <button type="button" onClick={onClose} style={{ marginTop: spacing.lg }}>
              {t('common.close', 'Kapat')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { usePublish } from '../../api/mutations'
import * as planner from '../../../api/planner'
import { colors, spacing } from '../../../theme/tokens'
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
    <div className="modal-bg">
      <div className="modal">
        <div className="modal-head">{t('planner.publishReview', 'Yayın öncesi inceleme')}</div>

        <div className="modal-body">
          {loadingFindings && <div>{t('common.loading', 'Yükleniyor…')}</div>}

          {!loadingFindings && !publish.isSuccess && (
            <>
              {errors.length === 0 && warnings.length === 0 && (
                <div style={{ color: colors.tealDark }}>{t('planner.noFindings', 'Doğrulama bulgusu yok.')}</div>
              )}
              {(errors.length > 0 || warnings.length > 0) && (
                <div className="pub-errbox">
                  {errors.map((f, i) => (
                    <div key={`e${i}`} className="e">
                      🔴 {f.code} — {f.message}
                    </div>
                  ))}
                  {warnings.map((f, i) => (
                    <div key={`w${i}`}>
                      🟡 {f.code} — {f.message}
                    </div>
                  ))}
                </div>
              )}

              {needsOverride && (
                <div style={{ marginTop: spacing.lg, display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
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
            </>
          )}

          {publish.isSuccess && (
            <div>
              <div style={{ color: colors.tealDark }}>
                {t('planner.visitsMaterialized', 'Oluşturulan ziyaret sayısı')}: {publish.data.visitsMaterialized}
              </div>
              {publish.data.overrodeErrors && (
                <div style={{ marginTop: spacing.sm }}>
                  {t('planner.decisionRecorded', 'Karar kaydedildi')}: {publish.data.decisionJournalId}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          {!publish.isSuccess ? (
            <>
              <button type="button" onClick={onClose}>
                {t('common.cancel', 'Vazgeç')}
              </button>
              <button
                type="button"
                className="primary"
                data-testid="publish-modal-submit"
                onClick={handlePublish}
                disabled={loadingFindings || publish.isPending || (needsOverride && !overrideReady)}
              >
                {t('common.publish', 'Yayınla')}
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

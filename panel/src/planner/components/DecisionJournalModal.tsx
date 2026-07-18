import { useTranslation } from 'react-i18next'
import { useDecisionJournal } from '../api/queries'

interface DecisionJournalModalProps {
  onClose: () => void
}

const KIND_LABEL: Record<string, string> = {
  PublishOverride: '📤 Yayın',
  Repair: '✨ Onarım',
  Permanent: '📌 Kalıcı değişiklik',
}

/** 📖 Karar Günlüğü viewer (prototype evo-planner-prototype-v0.5.html:2079-2091) — NOT an activity
 * log: who/what/when/WHY + objective, for every publish-with-errors override and Onarım repair.
 * Backed by the new read-only GET /decision-journal (spec-010-era write paths already existed;
 * there was simply no viewer). */
export function DecisionJournalModal({ onClose }: DecisionJournalModalProps) {
  const { t } = useTranslation()
  const { data: page, isLoading, isError } = useDecisionJournal(true)
  const entries = page?.items ?? []

  return (
    <div className="modal-bg">
      <div className="modal" style={{ width: 560 }}>
        <div className="modal-head">📖 {t('planner.decisionJournal', 'Karar Günlüğü')}</div>
        <div className="modal-body">
          {isLoading && <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>}
          {isError && <div className="empty">{t('common.loadError', 'Yüklenemedi. Tekrar deneyin.')}</div>}
          {!isLoading && !isError && entries.length === 0 && (
            <div style={{ color: 'var(--tx3)', fontSize: 12, padding: 10 }}>
              {t('planner.decisionJournalEmpty', 'Henüz kayıtlı karar yok. Yayınlar, onarımlar ve gerekçeli hata geçişleri burada birikir.')}
            </div>
          )}
          {entries.map((e) => {
            const errors: string[] = e.errorsJson ? JSON.parse(e.errorsJson) : []
            return (
              <div key={e.id} className="jr-item">
                <b>{(e.kind && KIND_LABEL[e.kind]) ?? '📝 Karar'}</b> — {e.description}
                {e.reason && <div className="jr-reason">{t('planner.reason', 'Neden')}: {e.reason}</div>}
                <div className="jm">
                  {e.createdAt && new Date(e.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {e.objective ? ` · ${t('planner.objective', 'Amaç')}: ${e.objective}` : ''}
                  {errors.length > 0 ? ` · 🔴 ${errors.length} hata gerekçeyle geçildi` : ''}
                </div>
                {errors.length > 0 && (
                  <div className="jm" style={{ marginTop: 2 }}>
                    {errors.map((code) => (
                      <div key={code}>· {code}</div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
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

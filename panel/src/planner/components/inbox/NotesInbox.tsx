import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotes } from '../../api/queries'
import { useUpdateNoteStatus } from '../../api/mutations'
import { useDisruptions } from '../../../onarim/api/queries'

const ANCHOR_LABEL: Record<number, string> = { 1: 'Mağaza', 2: 'Ziyaret', 3: 'Gün', 4: 'Genel' }
const KIND_LABEL: Record<number, string> = { 1: 'Not', 2: 'Değişiklik Talebi' }
const KIND_ICON: Record<number, string> = { 1: '💬', 2: '✋' }
const DISRUPTION_KIND_LABEL: Record<string, string> = { Absence: 'İzin', StoreClosure: 'Mağaza Kapalı' }

interface NotesInboxProps {
  open: boolean
  onClose: () => void
  onOpenDisruption: (disruptionId: string) => void
}

type InboxTab = 'field' | 'issues'

/** Right slide-in panel — matches the prototype's `.page`/`.page.on` (evo-planner-prototype-v0.5.html:
 * 410-417), not a centered modal. Always mounted so the slide transition actually animates. Second
 * tab (⚠ Sorunlar) is where Onarım repair entries live — the prototype's Sorunlar tab is a generic
 * validation-findings feed (needs province-wide aggregation, not built, see gap-matrix §8); this
 * tab is scoped to what's real today: open Onarım disruptions, which is the same "something needs
 * your attention, click to resolve" affordance. Replaces the standalone topbar ✨ Onarım button. */
export function NotesInbox({ open, onClose, onOpenDisruption }: NotesInboxProps) {
  const { t } = useTranslation()
  const { data: notes, isLoading, isError } = useNotes({ status: 1 })
  const updateStatus = useUpdateNoteStatus()
  const openCount = notes?.length ?? 0
  const { data: disruptions, isLoading: loadingDisruptions } = useDisruptions()
  const affectedVisitTotal = (disruptions ?? []).reduce((sum, d) => sum + (d.affectedVisitCount ?? 0), 0)
  const [tab, setTab] = useState<InboxTab>('field')

  return (
    <div className={`page${open ? ' on' : ''}`} aria-hidden={!open}>
      <div className="page-top">
        <span className="ttl">{t('planner.notesInbox', 'Gelen kutusu')}</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button type="button" onClick={onClose}>
          ✕ {t('common.close', 'Kapat')}
        </button>
      </div>

      <div className="admin-tabs">
        <div className={tab === 'field' ? 'on' : ''} onClick={() => setTab('field')}>
          💬 {t('planner.notesInboxTabField', 'Saha')}
          {openCount ? ` (${openCount})` : ''}
        </div>
        <div className={tab === 'issues' ? 'on' : ''} onClick={() => setTab('issues')} data-testid="inbox-issues-tab">
          ⚠ {t('planner.notesInboxTabIssues', 'Sorunlar')}
          {affectedVisitTotal > 0 ? ` ✨${affectedVisitTotal}` : ''}
        </div>
      </div>

      <div className="page-body">
        {tab === 'field' && (
          <>
            {isLoading && <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>}
            {isError && <div className="empty">{t('common.loadError', 'Yüklenemedi. Tekrar deneyin.')}</div>}
            {!isLoading && !isError && (notes ?? []).length === 0 && (
              <div className="empty">{t('planner.noOpenNotes', 'Açık not yok.')}</div>
            )}

            {(notes ?? []).map((note) => (
              <div key={note.id} className="inbox-item">
                <div style={{ fontSize: 15 }}>{note.kind !== undefined ? KIND_ICON[note.kind] : '💬'}</div>
                <div className="bd">
                  <span className="who">{note.authorName ?? t('planner.notesInboxSystem', 'Sistem')}</span>
                  {' · '}
                  <span style={{ color: 'var(--tx3)', fontSize: 11 }}>{note.kind !== undefined ? KIND_LABEL[note.kind] : ''}</span>
                  <br />
                  {note.body}
                  <br />
                  {(note.anchorLabel || note.anchorType !== undefined) && (
                    <span className="anchor">
                      📍 {note.anchorLabel ?? (note.anchorType !== undefined ? ANCHOR_LABEL[note.anchorType] : '')}
                    </span>
                  )}
                </div>
                <div className="acts">
                  <button
                    type="button"
                    onClick={() => updateStatus.mutate({ id: note.id!, body: { status: 2 } })}
                    disabled={updateStatus.isPending}
                  >
                    {t('planner.acknowledge', 'Onayla')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateStatus.mutate({ id: note.id!, body: { status: 3 } })}
                    disabled={updateStatus.isPending}
                  >
                    {t('planner.resolve', 'Çözüldü')}
                  </button>
                </div>
              </div>
            ))}

            {(notes ?? []).length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 8 }}>
                {t(
                  'planner.notesInboxFooter',
                  'Saha temsilcileri not/talep yazabilir ama planı düzenleyemez. Talebi uygulamak süpervizörün tek tıkı — değişiklik normal taslak akışına girer (Yayınla gerekir).',
                )}
              </div>
            )}
          </>
        )}

        {tab === 'issues' && (
          <>
            {loadingDisruptions && <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>}
            {!loadingDisruptions && (disruptions ?? []).length === 0 && (
              <div className="empty">{t('onarim.noDisruptions', 'Açık aksaklık yok.')}</div>
            )}
            {(disruptions ?? []).map((d) => (
              <div
                key={d.id}
                className="inbox-item"
                style={{ cursor: 'pointer' }}
                onClick={() => d.id && onOpenDisruption(d.id)}
                data-testid="issue-row"
                data-affected-count={d.affectedVisitCount ?? 0}
              >
                <div style={{ fontSize: 15 }}>✨</div>
                <div className="bd">
                  <span className="who">{d.label}</span>
                  {' · '}
                  <span style={{ color: 'var(--tx3)', fontSize: 11 }}>{d.kind ? (DISRUPTION_KIND_LABEL[d.kind] ?? d.kind) : ''}</span>
                  <br />
                  {d.start} → {d.end}
                  <br />
                  <span className="anchor">
                    {t('onarim.affectedVisits', '{{count}} etkilenen ziyaret', { count: d.affectedVisitCount ?? 0 })} — {t('planner.notesInboxIssueOpen', 'Onarım için tıkla')}
                  </span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

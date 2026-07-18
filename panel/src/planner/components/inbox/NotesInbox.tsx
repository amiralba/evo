import { useTranslation } from 'react-i18next'
import { useNotes } from '../../api/queries'
import { useUpdateNoteStatus } from '../../api/mutations'

const ANCHOR_LABEL: Record<number, string> = { 1: 'Mağaza', 2: 'Ziyaret', 3: 'Gün', 4: 'Genel' }
const KIND_LABEL: Record<number, string> = { 1: 'Not', 2: 'Değişiklik Talebi' }
const KIND_ICON: Record<number, string> = { 1: '💬', 2: '✋' }

interface NotesInboxProps {
  open: boolean
  onClose: () => void
}

/** Right slide-in panel — matches the prototype's `.page`/`.page.on` (evo-planner-prototype-v0.5.html:410-417),
 * not a centered modal. Always mounted (like the prototype's static `#inboxPage`) so the slide transition
 * actually animates on open/close instead of popping in. */
export function NotesInbox({ open, onClose }: NotesInboxProps) {
  const { t } = useTranslation()
  const { data: notes, isLoading, isError } = useNotes({ status: 1 })
  const updateStatus = useUpdateNoteStatus()
  const openCount = notes?.length ?? 0

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
        <div className="on">
          💬 {t('planner.notesInboxTabField', 'Saha')}
          {openCount ? ` (${openCount})` : ''}
        </div>
      </div>

      <div className="page-body">
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
      </div>
    </div>
  )
}

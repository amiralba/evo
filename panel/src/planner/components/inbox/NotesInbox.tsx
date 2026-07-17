import { useTranslation } from 'react-i18next'
import { useNotes } from '../../api/queries'
import { useUpdateNoteStatus } from '../../api/mutations'

const ANCHOR_LABEL: Record<number, string> = { 1: 'Mağaza', 2: 'Ziyaret', 3: 'Gün', 4: 'Genel' }
const KIND_LABEL: Record<number, string> = { 1: 'Not', 2: 'Değişiklik Talebi' }

interface NotesInboxProps {
  onClose: () => void
}

export function NotesInbox({ onClose }: NotesInboxProps) {
  const { t } = useTranslation()
  const { data: notes, isLoading, isError } = useNotes({ status: 1 })
  const updateStatus = useUpdateNoteStatus()

  return (
    <div className="modal-bg">
      <div className="modal">
        <div className="modal-head">{t('planner.notesInbox', 'Gelen Kutusu')}</div>

        <div className="modal-body">
          {isLoading && <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>}
          {isError && <div className="empty">{t('common.loadError', 'Yüklenemedi. Tekrar deneyin.')}</div>}
          {!isLoading && !isError && (notes ?? []).length === 0 && (
            <div className="empty">{t('planner.noOpenNotes', 'Açık not yok.')}</div>
          )}

          {(notes ?? []).map((note) => (
            <div key={note.id} className="hist-item">
              <div className="d">
                {note.anchorLabel ?? (note.anchorType !== undefined ? ANCHOR_LABEL[note.anchorType] : '')} ·{' '}
                {note.kind !== undefined ? KIND_LABEL[note.kind] : ''}
              </div>
              <div>{note.body}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
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

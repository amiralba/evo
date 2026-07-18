import { useTranslation } from 'react-i18next'

interface HelpModalProps {
  onClose: () => void
}

/** ? Kullanım kılavuzu (prototype #helpBtn, evo-planner-prototype-v0.5.html:2969-3010) — content
 * rewritten to describe what the panel actually does today, not the prototype's full feature set
 * (full 6-tab table, CSV export, module editor, right-click menu, Efektif/Baz toggle, global search
 * are all still deferred — see docs/prototype-parity). Claiming those here would be misleading. */
export function HelpModal({ onClose }: HelpModalProps) {
  const { t } = useTranslation()

  return (
    <div className="modal-bg">
      <div className="modal" style={{ width: 560, maxHeight: '86vh' }}>
        <div className="modal-head">? {t('planner.helpTitle', 'Kullanım kılavuzu')}</div>
        <div className="modal-body" style={{ fontSize: 12, lineHeight: 1.5 }}>
          <h3>🗺 {t('planner.helpLayoutTitle', 'Genel düzen')}</h3>
          <p>
            {t(
              'planner.helpLayoutBody',
              'Tek ekran, üç bölüm: solda Harita (nerede), sağda Takvim (ne zaman), alttan Tablo çekmecesi (salt okunur liste). Üstteki Harita · Bölünmüş · Takvim · Tablo düğmeleri düzeni değiştirir — sayfa asla değişmez.',
            )}
          </p>

          <h3>🧭 {t('planner.helpRailTitle', 'Sol şerit (Rutlar / Havuz)')}</h3>
          <p>
            {t(
              'planner.helpRailBody',
              'Ruta tıkla → takvim ve panel o ruta odaklanır (tekrar tıkla = kaldır). ▸ ok → rutun mağaza listesi açılır, sürükleyip bırak ile ziyaret sırası değişir. Havuz sekmesi = hiçbir ruta atanmamış mağazalar. + Yeni rut ile taslak bir rut oluşturabilirsin.',
            )}
          </p>

          <h3>🗺 {t('planner.helpMapTitle', 'Harita')}</h3>
          <p>
            {t(
              'planner.helpMapBody',
              'Pine tıkla → mini kart (ciro, rut); mağaza adına tıkla → sağ panele genişler. Kement ile bir alan çiz (çift tıkla kapat) → içindeki mağazalar toplu seçilir.',
            )}
          </p>

          <h3>📅 {t('planner.helpScheduleTitle', 'Takvim')}</h3>
          <p>
            {t(
              'planner.helpScheduleBody',
              'Blok sürükle (başka gün) → dated bir yama önerir (bitiş tarihi zorunlu). Bloğun alt kenarını çek → süre değişir, alttaki bloklar canlı kayar — bırakınca kalıcı olarak kaydedilir. Gün başındaki dakika toplamı kırmızıysa kota aşılmış (sadece uyarı, engellemez).',
            )}
          </p>

          <h3>📋 {t('planner.helpPanelTitle', 'Sağ panel (Detay)')}</h3>
          <p>
            {t(
              'planner.helpPanelBody',
              'Neye tıklarsan onun detayı: Bilgi · Görevler · Geçmiş. Görevler sekmesinde her görevin süresi ve kaynağı (şablon/kural) görünür; ✎ ile kapsam seçerek (bu ziyaret / bu mağaza / tüm format) süreyi değiştirebilirsin.',
            )}
          </p>

          <h3>🔴 {t('planner.helpValidationTitle', 'Doğrulama')}</h3>
          <p>
            {t(
              'planner.helpValidationBody',
              'Hatalar (🔴) yayını durdurmaz — ama gerekçe ve amaç ister; bu Karar Günlüğü\'ne (📖) yazılır. "Uyar, asla engelleme" ilkesi.',
            )}
          </p>
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

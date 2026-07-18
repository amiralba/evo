import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateRoute } from '../api/mutations'
import { useWorkspaceStore } from '../state/workspaceStore'

interface NewRouteModalProps {
  onClose: () => void
  onCreated: (routeId: string) => void
}

/** + Yeni rut (prototype openNewRouteModal, evo-planner-prototype-v0.5.html:1139) — the backend's
 * POST /routes already existed (route code auto-generated from province if left blank, defaults to
 * Draft status); this was purely a missing panel form. */
export function NewRouteModal({ onClose, onCreated }: NewRouteModalProps) {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const createRoute = useCreateRoute(province)
  const [name, setName] = useState('')
  const [routeCode, setRouteCode] = useState('')
  const [revenueTarget, setRevenueTarget] = useState('')

  function handleCreate() {
    if (!name.trim()) return
    createRoute.mutate(
      {
        name: name.trim(),
        province,
        routeCode: routeCode.trim() || null,
        revenueTarget: revenueTarget ? Number(revenueTarget) : null,
      },
      {
        onSuccess: (route) => {
          if (route.id) onCreated(route.id)
          onClose()
        },
      },
    )
  }

  return (
    <div className="modal-bg">
      <div className="modal" style={{ width: 380 }}>
        <div className="modal-head">{t('planner.newRoute', '+ Yeni rut')}</div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 12 }}>
            {t('planner.newRouteName', 'Rut adı')} *
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              style={{ width: '100%', marginTop: 3, boxSizing: 'border-box' }}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            {t('planner.newRouteCode', 'Rut kodu (boş bırakılırsa otomatik)')}
            <input type="text" value={routeCode} onChange={(e) => setRouteCode(e.target.value)} style={{ width: '100%', marginTop: 3, boxSizing: 'border-box' }} />
          </label>
          <label style={{ fontSize: 12 }}>
            {t('planner.newRouteTarget', 'Ciro hedefi (₺, opsiyonel)')}
            <input
              type="number"
              value={revenueTarget}
              onChange={(e) => setRevenueTarget(e.target.value)}
              style={{ width: '100%', marginTop: 3, boxSizing: 'border-box' }}
            />
          </label>
          <div style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
            {t('planner.newRouteFooter', 'Taslak olarak oluşturulur — haritadan mağaza ekleyip kişi atadıktan sonra aktifleştirin.')}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" onClick={onClose}>
            {t('common.cancel', 'Vazgeç')}
          </button>
          <button type="button" className="primary" disabled={!name.trim() || createRoute.isPending} onClick={handleCreate}>
            {t('common.save', 'Kaydet')}
          </button>
        </div>
      </div>
    </div>
  )
}

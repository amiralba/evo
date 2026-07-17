import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { useCreatePatch } from '../../api/mutations'
import { colors, spacing, radius, fontSize } from '../../../theme/tokens'
import type { components } from '../../../api/generated/schema'

type RouteStopDto = components['schemas']['RouteStopDto']

const PATCH_TYPE_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Mağazayı Atla (SkipStore)' },
  { value: 3, label: 'Mağaza Ekle (AddStore)' },
  { value: 5, label: 'Zaman Kaydır (TimeShift)' },
]

interface PatchFormProps {
  routeId: string
  stops: RouteStopDto[]
  onClose: () => void
}

export function PatchForm({ routeId, stops, onClose }: PatchFormProps) {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const createPatch = useCreatePatch(routeId, province)

  const [type, setType] = useState(1)
  const [storeId, setStoreId] = useState(stops[0]?.storeId ?? '')
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [endsOn, setEndsOn] = useState('')
  const [reason, setReason] = useState('')

  const expiryInvalid = !endsOn || endsOn < startsOn

  function handleSave() {
    if (expiryInvalid) return
    createPatch.mutate(
      {
        type: type as 1 | 2 | 3 | 4 | 5,
        storeId: type === 1 || type === 3 ? storeId : null,
        startsOn,
        endsOn,
        reason: reason || null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div
      style={{
        padding: spacing.xl,
        borderTop: `1px solid ${colors.border}`,
        background: colors.grayLight,
        fontSize: fontSize.md,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.lg,
      }}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
        {t('planner.patchType', 'Yama tipi')}
        <select value={type} onChange={(e) => setType(Number(e.target.value))}>
          {PATCH_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {(type === 1 || type === 3) && (
        <label style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
          {t('planner.store', 'Mağaza')}
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stops.map((s) => (
              <option key={s.storeId} value={s.storeId}>
                {s.storeName}
              </option>
            ))}
          </select>
        </label>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
        {t('planner.startsOn', 'Başlangıç')}
        <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
        {t('planner.endsOn', 'Bitiş (zorunlu)')}
        <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
      </label>
      {expiryInvalid && (
        <div style={{ color: colors.redDark, fontSize: fontSize.sm }}>
          {t('planner.patchExpiryRequired', 'Bir bitiş tarihi zorunludur ve başlangıçtan önce olamaz.')}
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
        {t('planner.reason', 'Neden')}
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1 }} />
      </label>

      <div style={{ display: 'flex', gap: spacing.sm }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={expiryInvalid || createPatch.isPending}
          style={{ borderRadius: radius.md, background: colors.blue, color: 'white', border: 'none', padding: `${spacing.sm} ${spacing.lg}` }}
        >
          {t('common.save', 'Kaydet')}
        </button>
        <button type="button" onClick={onClose}>
          {t('common.cancel', 'Vazgeç')}
        </button>
      </div>
    </div>
  )
}

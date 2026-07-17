import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { useUpdateStop } from '../../api/mutations'
import { colors, spacing, radius, fontSize } from '../../../theme/tokens'
import type { components } from '../../../api/generated/schema'

type RouteStopDto = components['schemas']['RouteStopDto']

const FREQUENCY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Günlük' },
  { value: 2, label: 'Haftalık' },
  { value: 3, label: 'İki Haftalık' },
]

interface StopEditFormProps {
  routeId: string
  stop: RouteStopDto
  onClose: () => void
}

export function StopEditForm({ routeId, stop, onClose }: StopEditFormProps) {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const updateStop = useUpdateStop(routeId, province)
  const [frequency, setFrequency] = useState(stop.frequency ?? 2)
  const [serviceMinutes, setServiceMinutes] = useState(stop.serviceMinutes ?? 30)
  const [sequence, setSequence] = useState(stop.sequence ?? 1)

  function handleSave() {
    if (!stop.id) return
    updateStop.mutate(
      { stopId: stop.id, body: { frequency: frequency as 1 | 2 | 3, serviceMinutes, sequence } },
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
        {t('planner.frequency', 'Sıklık')}
        <select value={frequency} onChange={(e) => setFrequency(Number(e.target.value) as 1 | 2 | 3)}>
          {FREQUENCY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
        {t('planner.serviceMinutes', 'Süre (dk)')}
        <input
          type="number"
          min={1}
          value={serviceMinutes}
          onChange={(e) => setServiceMinutes(Number(e.target.value))}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
        {t('planner.sequence', 'Sıra')}
        <input type="number" min={1} value={sequence} onChange={(e) => setSequence(Number(e.target.value))} />
      </label>
      <div style={{ display: 'flex', gap: spacing.sm }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={updateStop.isPending}
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

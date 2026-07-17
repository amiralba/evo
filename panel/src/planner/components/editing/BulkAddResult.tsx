import { useTranslation } from 'react-i18next'
import type { components } from '../../../api/generated/schema'
import { colors, spacing, radius, fontSize } from '../../../theme/tokens'

type BulkAddResultDto = components['schemas']['BulkAddResultDto']

interface BulkAddResultProps {
  result: BulkAddResultDto
  onMoveHere: (storeId: string) => void
}

const REASON_LABEL: Record<string, string> = {
  store_not_found: 'Mağaza bulunamadı',
  out_of_geo_scope: 'Coğrafi kapsam dışında',
  on_another_route: 'Başka bir rotada',
}

export function BulkAddResult({ result, onMoveHere }: BulkAddResultProps) {
  const { t } = useTranslation()
  const rejected = result.rejected ?? []

  return (
    <div style={{ padding: spacing.lg, fontSize: fontSize.sm }}>
      <div style={{ color: colors.tealDark }}>
        {t('planner.added', 'Eklendi')}: {result.added?.length ?? 0}
      </div>
      {rejected.length > 0 && (
        <div style={{ marginTop: spacing.sm }}>
          {rejected.map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                padding: `${spacing.xs} 0`,
              }}
            >
              <span
                style={{
                  fontSize: fontSize.xs,
                  padding: `1px ${spacing.sm}`,
                  borderRadius: radius.pill,
                  background: colors.redLight,
                  color: colors.redDark,
                }}
              >
                {REASON_LABEL[r.reason ?? ''] ?? r.reason}
              </span>
              {r.reason === 'on_another_route' && r.storeId && (
                <button type="button" onClick={() => onMoveHere(r.storeId!)} style={{ fontSize: fontSize.xs }}>
                  {t('planner.moveHere', 'Buraya taşı')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import { BarChart, Bar, ReferenceLine, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { useHealth } from '../../api/queries'
import { colors, spacing, fontSize, radius, severityColors } from '../../../theme/tokens'
import { formatTRY } from '../../format'

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const WEEKDAY_LABEL: Record<string, string> = {
  Monday: 'Pzt',
  Tuesday: 'Sal',
  Wednesday: 'Çar',
  Thursday: 'Per',
  Friday: 'Cum',
}
const CATEGORY_LABEL: Record<string, string> = { Planned: 'P', Variable: 'V', Service: 'S', Potential: 'Pot' }
const DONUT_COLORS = [colors.teal, colors.amber, colors.grayMid, colors.blue]

interface HealthCardProps {
  routeId: string
}

export function HealthCard({ routeId }: HealthCardProps) {
  const { t } = useTranslation()
  const { data: health, isLoading, isError } = useHealth(routeId)

  if (isLoading) {
    return <div style={{ padding: spacing.xl, fontSize: fontSize.md }}>{t('common.loading', 'Yükleniyor…')}</div>
  }
  if (isError || !health) {
    return (
      <div style={{ padding: spacing.xl, color: colors.redDark, fontSize: fontSize.md }}>
        {t('planner.noHealthYet', 'Bu rota için henüz sağlık verisi yok.')}
      </div>
    )
  }

  const revenue = health.sixMonthRevenue ?? 0
  const target = health.revenueTarget ?? 0
  const revenueMet = health.revenueMet ?? false

  const weekdayData = WEEKDAY_ORDER.map((day) => ({
    day: WEEKDAY_LABEL[day],
    minutes: health.minutesByWeekday?.[day] ?? 0,
  }))

  const mixEntries = Object.entries(health.categoryMix ?? {})
  const mixData = mixEntries.map(([key, value]) => ({ name: CATEGORY_LABEL[key] ?? key, value }))

  return (
    <div style={{ padding: spacing.xl, borderBottom: `1px solid ${colors.border}` }}>
      <div style={{ fontSize: fontSize.sm, color: colors.text2, marginBottom: spacing.xs }}>
        {t('planner.revenue', 'Ciro')}: {formatTRY(revenue)} / {formatTRY(target)}
      </div>
      <ResponsiveContainer width="100%" height={28}>
        <BarChart layout="vertical" data={[{ name: 'revenue', revenue }]} margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
          <XAxis type="number" domain={[0, Math.max(target, revenue)]} hide />
          <YAxis type="category" dataKey="name" hide />
          <Bar dataKey="revenue" fill={revenueMet ? colors.green : colors.red} radius={4} />
        </BarChart>
      </ResponsiveContainer>

      <div style={{ fontSize: fontSize.sm, color: colors.text2, margin: `${spacing.lg} 0 ${spacing.xs}` }}>
        {t('planner.weekdayMinutes', 'Haftalık dakika')}
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={weekdayData}>
          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
          <YAxis hide />
          <ReferenceLine y={450} stroke={colors.text3} strokeDasharray="3 3" />
          <Bar dataKey="minutes" radius={3}>
            {weekdayData.map((d, i) => (
              <Cell key={i} fill={d.minutes > 450 ? colors.red : d.minutes < 400 ? colors.amber : colors.green} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {mixData.length > 0 && (
        <>
          <div style={{ fontSize: fontSize.sm, color: colors.text2, margin: `${spacing.lg} 0 ${spacing.xs}` }}>
            {t('planner.categoryMix', 'Karışım')}
          </div>
          <ResponsiveContainer width="100%" height={80}>
            <PieChart>
              <Pie data={mixData} dataKey="value" nameKey="name" innerRadius={20} outerRadius={35}>
                {mixData.map((_, i) => (
                  <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </>
      )}

      <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md }}>
        {(health.errorCount ?? 0) > 0 && (
          <span
            style={{
              fontSize: fontSize.xs,
              padding: `1px ${spacing.sm}`,
              borderRadius: radius.pill,
              background: severityColors.err.bg,
              color: severityColors.err.fg,
            }}
          >
            🔴 {health.errorCount}
          </span>
        )}
        {(health.warningCount ?? 0) > 0 && (
          <span
            style={{
              fontSize: fontSize.xs,
              padding: `1px ${spacing.sm}`,
              borderRadius: radius.pill,
              background: severityColors.warn.bg,
              color: severityColors.warn.fg,
            }}
          >
            🟡 {health.warningCount}
          </span>
        )}
      </div>
    </div>
  )
}

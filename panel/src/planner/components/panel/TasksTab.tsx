import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStoreTaskPlan } from '../../api/queries'
import { formatMinutes } from '../../format'
import { TaskScopeModal } from './TaskScopeModal'
import type { components } from '../../../api/generated/schema'

type ResolvedTaskDto = components['schemas']['ResolvedTaskDto']

const SOURCE_KEY_BY_LAYER: Record<string, string> = {
  'template default': 'template',
  Global: 'format',
  Chain: 'chain',
  Format: 'format',
  Route: 'route',
  Store: 'store',
  'manual (instance)': 'manual',
}

function sourceKey(task: ResolvedTaskDto): string {
  const trace = task.trace ?? []
  const lastLayer = trace.length > 0 ? trace[trace.length - 1].layer ?? '' : 'template default'
  return SOURCE_KEY_BY_LAYER[lastLayer] ?? 'template'
}

interface TasksTabProps {
  routeId: string
  storeId: string
  date: string
}

export function TasksTab({ routeId, storeId, date }: TasksTabProps) {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useStoreTaskPlan(storeId, date)
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<ResolvedTaskDto | null>(null)

  if (isLoading) return <div className="empty">{t('common.loading', 'Yükleniyor…')}</div>
  if (isError) return <div className="empty">{t('common.loadError', 'Yüklenemedi. Tekrar deneyin.')}</div>

  const tasks = data?.tasks ?? []

  if (tasks.length === 0) {
    return <div className="empty">{t('planner.noTasks', 'Bu ziyaret için görev bulunamadı.')}</div>
  }

  return (
    <div>
      {tasks.map((task) => (
        <div key={task.templateId}>
          <div className="kv" style={{ cursor: 'pointer' }} onClick={() => setEditingTask(task)}>
            <span className="k">{task.name}</span>
            <span>
              {formatMinutes(task.minutes ?? 0)}
              <span
                className="pill"
                onClick={(e) => {
                  e.stopPropagation()
                  setExpandedTemplateId((cur) => (cur === task.templateId ? null : (task.templateId ?? null)))
                }}
              >
                {t(`planner.taskSource.${sourceKey(task)}`, sourceKey(task))}
              </span>
            </span>
          </div>
          {expandedTemplateId === task.templateId && (
            <div className="popover" style={{ position: 'static', width: 'auto', margin: '0 0 8px' }}>
              {(task.trace ?? []).map((step, i) => (
                <div className="row" key={i}>
                  {step.layer}: {step.before} → {step.after} ({step.op})
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="kv" style={{ fontWeight: 600 }}>
        <span>{t('planner.visitTotal', 'Ziyaret toplamı')}</span>
        <span>{formatMinutes(data?.visitTotalMinutes ?? 0)}</span>
      </div>

      {editingTask && (
        <TaskScopeModal
          routeId={routeId}
          storeId={storeId}
          date={date}
          task={editingTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  )
}

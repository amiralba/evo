import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { useStoreDetail, useRuleImpact } from '../../api/queries'
import { useUpdateTaskInstanceScope } from '../../api/mutations'
import { formatMinutes } from '../../format'
import type { RuleImpactParams } from '../../../api/planner'
import type { components } from '../../../api/generated/schema'

type ResolvedTaskDto = components['schemas']['ResolvedTaskDto']

const FORMAT_LABEL: Record<number, string> = { 1: 'Jet', 2: 'M', 3: 'MM', 4: '3M', 5: '4M', 6: '5M' }

type ScopeChoice = 'INSTANCE' | 'STORE_RULE' | 'FORMAT_RULE'

interface TaskScopeModalProps {
  routeId: string
  storeId: string
  date: string
  task: ResolvedTaskDto
  onClose: () => void
}

export function TaskScopeModal({ routeId, storeId, date, task, onClose }: TaskScopeModalProps) {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const { data: store } = useStoreDetail(storeId)
  const [scope, setScope] = useState<ScopeChoice>('INSTANCE')
  const [minutes, setMinutes] = useState(task.minutes ?? 0)
  const updateScope = useUpdateTaskInstanceScope(routeId, province, storeId, date)

  const impactParams: RuleImpactParams | null =
    scope === 'INSTANCE' || !task.templateId
      ? null
      : scope === 'STORE_RULE'
        ? { scope: 4, taskTemplateId: task.templateId, storeId, op: 3, setValue: minutes }
        : { scope: 2, taskTemplateId: task.templateId, format: store?.format, op: 3, setValue: minutes }

  const { data: impact, isLoading: isImpactLoading } = useRuleImpact(impactParams)

  useEffect(() => {
    if (updateScope.isSuccess) onClose()
  }, [updateScope.isSuccess, onClose])

  function handleSave() {
    if (!task.taskInstanceId) return
    updateScope.mutate({ taskInstanceId: task.taskInstanceId, body: { minutes, scope } })
  }

  return (
    <div className="modal-bg">
      <div className="modal">
        <div className="modal-head">{t('planner.applyScope.title', 'Kapsam seç')}</div>

        <div className="modal-body">
          <label>
            {t('planner.taskDuration', 'Süre')}
            <input
              type="number"
              className="pub-textarea"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>

          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label>
              <input type="radio" checked={scope === 'INSTANCE'} onChange={() => setScope('INSTANCE')} />{' '}
              {t('planner.applyScope.thisVisit', 'Sadece bu ziyaret')}
            </label>
            <label>
              <input type="radio" checked={scope === 'STORE_RULE'} onChange={() => setScope('STORE_RULE')} />{' '}
              {t('planner.applyScope.thisStore', 'Bu mağaza için (bundan sonra)')}
            </label>
            <label>
              <input type="radio" checked={scope === 'FORMAT_RULE'} onChange={() => setScope('FORMAT_RULE')} />{' '}
              {t('planner.applyScope.allFormat', 'Tüm {{format}} formatındaki mağazalar için', {
                format: store?.format !== undefined ? (FORMAT_LABEL[store.format] ?? store.format) : '',
              })}
            </label>
          </div>

          {impactParams && (
            <div className="pub-errbox" style={{ marginTop: 10 }}>
              {isImpactLoading && <div>{t('common.loading', 'Yükleniyor…')}</div>}
              {impact && (
                <div className="row">
                  <div>{t('planner.impactPreview.title', 'Etki önizlemesi')}</div>
                  <div>
                    {impact.stores} {t('planner.impactPreview.stores', 'mağaza')}, {impact.visitsPerWeek}{' '}
                    {t('planner.impactPreview.visitsPerWeek', 'haftalık ziyaret')}, {(impact.deltaMinutesPerWeek ?? 0) >= 0 ? '+' : ''}
                    {formatMinutes(impact.deltaMinutesPerWeek ?? 0)} {t('planner.impactPreview.deltaMinutesPerWeek', 'haftalık dk değişimi')},{' '}
                    {impact.daysOver450} {t('planner.impactPreview.daysOver450', '450 dk üzeri gün')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" onClick={onClose}>
            {t('common.cancel', 'Vazgeç')}
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleSave}
            disabled={!task.taskInstanceId || updateScope.isPending}
          >
            {t('common.save', 'Kaydet')}
          </button>
        </div>
      </div>
    </div>
  )
}

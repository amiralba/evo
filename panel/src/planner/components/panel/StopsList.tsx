import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { components } from '../../../api/generated/schema'
import { colors, spacing, fontSize, radius } from '../../../theme/tokens'
import { formatMinutes } from '../../format'
import { useReorderStops } from '../../api/mutations'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { StopEditForm } from '../editing/StopEditForm'

type RouteStopDto = components['schemas']['RouteStopDto']

const FREQUENCY_LABEL: Record<number, string> = { 1: 'Günlük', 2: 'Haftalık', 3: 'İki Haftalık' }

interface StopsListProps {
  routeId: string
  stops: RouteStopDto[]
}

interface StopRowProps {
  stop: RouteStopDto
  onEditToggle: () => void
}

function StopRow({ stop, onEditToggle }: StopRowProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id ?? '' })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.lg,
        padding: `${spacing.md} 0`,
        borderBottom: `1px solid ${colors.border}`,
        fontSize: fontSize.md,
        cursor: 'pointer',
      }}
      onClick={onEditToggle}
    >
      <span {...attributes} {...listeners} style={{ cursor: 'grab', color: colors.text3 }}>
        ⠿
      </span>
      <span style={{ color: colors.text3, minWidth: 18 }}>{stop.sequence}</span>
      <span style={{ flex: 1 }}>{stop.storeName}</span>
      <span style={{ color: colors.text2, fontSize: fontSize.sm }}>
        {stop.serviceMinutes != null ? formatMinutes(stop.serviceMinutes) : t('planner.defaultDuration', 'varsayılan')}
      </span>
      <span
        style={{
          fontSize: fontSize.xs,
          padding: `1px ${spacing.sm}`,
          borderRadius: radius.pill,
          background: colors.grayLight,
          color: colors.text2,
        }}
      >
        {stop.frequency !== undefined ? (FREQUENCY_LABEL[stop.frequency] ?? stop.frequency) : '—'}
      </span>
    </div>
  )
}

export function StopsList({ routeId, stops }: StopsListProps) {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const reorderStops = useReorderStops(routeId, province)
  const [editingStopId, setEditingStopId] = useState<string | null>(null)
  const ordered = [...stops].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  if (ordered.length === 0) {
    return (
      <div style={{ padding: spacing.xl, color: colors.text3, fontSize: fontSize.md }}>
        {t('planner.noStops', 'Bu rotada durak yok.')}
      </div>
    )
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = ordered.findIndex((s) => s.id === active.id)
    const newIndex = ordered.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(ordered, oldIndex, newIndex)
    reorderStops.mutate(reordered.map((s) => s.id!).filter(Boolean))
  }

  const editingStop = ordered.find((s) => s.id === editingStopId) ?? null

  return (
    <div style={{ padding: spacing.xl }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ordered.map((s) => s.id ?? '')} strategy={verticalListSortingStrategy}>
          {ordered.map((stop) => (
            <StopRow
              key={stop.id}
              stop={stop}
              onEditToggle={() => setEditingStopId((cur) => (cur === stop.id ? null : (stop.id ?? null)))}
            />
          ))}
        </SortableContext>
      </DndContext>
      {editingStop && <StopEditForm routeId={routeId} stop={editingStop} onClose={() => setEditingStopId(null)} />}
    </div>
  )
}

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { useRoute } from '../api/queries'
import { useReorderStops } from '../api/mutations'
import { useWorkspaceStore } from '../state/workspaceStore'
import type { components } from '../../api/generated/schema'

type RouteStopDto = components['schemas']['RouteStopDto']

interface RailExpandedStopsProps {
  routeId: string
  routeColor: string
}

interface RailStopRowProps {
  stop: RouteStopDto
  index: number
  routeColor: string
}

function RailStopRow({ stop, index, routeColor }: RailStopRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id ?? '' })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        padding: '3px 2px',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        color: 'var(--tx2)',
        cursor: 'grab',
      }}
      {...attributes}
      {...listeners}
    >
      <span
        style={{
          minWidth: 16,
          height: 16,
          borderRadius: '50%',
          background: routeColor,
          color: '#fff',
          fontSize: 9,
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {index + 1}
      </span>
      {stop.storeName}
    </div>
  )
}

/** Rail's expand-to-ordered-stores view (prototype: `.rstore` rows, drag-reorder within the rail
 * itself — evo-planner-prototype-v0.5.html:1108-1123). Mirrors StopsList.tsx's dnd-kit pattern at
 * rail scale (170px column, numbered chips instead of a full row). */
export function RailExpandedStops({ routeId, routeColor }: RailExpandedStopsProps) {
  const { t } = useTranslation()
  const province = useWorkspaceStore((s) => s.province)
  const { data: route } = useRoute(routeId)
  const reorderStops = useReorderStops(routeId, province)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const ordered = [...(route?.stops ?? [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ordered.findIndex((s) => s.id === active.id)
    const newIndex = ordered.findIndex((s) => s.id === over.id)
    reorderStops.mutate(arrayMove(ordered, oldIndex, newIndex).map((s) => s.id!).filter(Boolean))
  }

  return (
    <div style={{ marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 4 }} onClick={(e) => e.stopPropagation()}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ordered.map((s) => s.id ?? '')} strategy={verticalListSortingStrategy}>
          {ordered.map((stop, i) => (
            <RailStopRow key={stop.id} stop={stop} index={i} routeColor={routeColor} />
          ))}
        </SortableContext>
      </DndContext>
      <div style={{ fontSize: 9, color: 'var(--tx3)', padding: 2 }}>{t('planner.dragToReorder', 'sıralamak için sürükle')}</div>
    </div>
  )
}

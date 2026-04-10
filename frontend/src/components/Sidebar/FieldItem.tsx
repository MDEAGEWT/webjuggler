import { useCursorStore } from '../../stores/useCursorStore'
import { useDataStore } from '../../stores/useDataStore'

interface Props {
  fieldPath: string
  fieldName: string
  selected: boolean
  allSelected: string[]
  onSelect: (mode: 'single' | 'toggle' | 'range') => void
}

/** Binary search for the index of the nearest timestamp */
function nearestIndex(timestamps: Float64Array, target: number): number {
  let lo = 0
  let hi = timestamps.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (timestamps[mid]! < target) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(timestamps[lo - 1]! - target) < Math.abs(timestamps[lo]! - target)) {
    return lo - 1
  }
  return lo
}

export default function FieldItem({
  fieldPath,
  fieldName,
  selected,
  allSelected,
  onSelect,
}: Props) {
  const cursorTs = useCursorStore((s) => s.timestamp)
  const fieldData = useDataStore((s) => s.adjustedData[fieldPath])

  function handleDragStart(e: React.DragEvent) {
    // If this item is selected, drag all selected; otherwise just this one
    const fieldsToDrag = selected && allSelected.length > 0
      ? allSelected
      : [fieldPath]

    e.dataTransfer.setData(
      'application/webjuggler-fields',
      JSON.stringify(fieldsToDrag),
    )
    e.dataTransfer.effectAllowed = 'copy'
  }

  function handleClick(e: React.MouseEvent) {
    if (e.shiftKey) onSelect('range')
    else if (e.ctrlKey || e.metaKey) onSelect('toggle')
    else onSelect('single')
  }

  let displayValue = ''
  if (cursorTs != null && fieldData && fieldData.timestamps.length > 0) {
    const idx = nearestIndex(fieldData.timestamps, cursorTs)
    const val = fieldData.values[idx]
    if (val != null) {
      displayValue = val.toFixed(3)
    }
  }

  return (
    <div
      className={`field-item ${selected ? 'field-item-selected' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
    >
      <span className="field-name">{fieldName}</span>
      {displayValue && <span className="field-value">{displayValue}</span>}
    </div>
  )
}

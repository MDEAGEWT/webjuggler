import { PLOT_COLORS } from '../../constants'

interface Props {
  fieldPath: string
  fieldName: string
  selected: boolean
  allSelected: string[]
  onSelect: (ctrlKey: boolean) => void
}

function hashColor(path: string): string {
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    hash = (hash * 31 + path.charCodeAt(i)) | 0
  }
  return PLOT_COLORS[Math.abs(hash) % PLOT_COLORS.length]!
}

export default function FieldItem({
  fieldPath,
  fieldName,
  selected,
  allSelected,
  onSelect,
}: Props) {
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
    onSelect(e.ctrlKey || e.metaKey)
  }

  const color = hashColor(fieldPath)

  return (
    <div
      className={`field-item ${selected ? 'field-item-selected' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
    >
      <span className="field-color-chip" style={{ backgroundColor: color }} />
      <span className="field-name">{fieldName}</span>
    </div>
  )
}

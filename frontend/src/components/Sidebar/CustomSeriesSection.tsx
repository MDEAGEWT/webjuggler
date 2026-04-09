import React, { useCallback } from 'react'
import { useCustomFunctionStore } from '../../stores/useCustomFunctionStore'

interface Props {
  onAdd: () => void
  onEdit: (id: string) => void
}

export const CustomSeriesSection: React.FC<Props> = ({ onAdd, onEdit }) => {
  const { functions, selectedId, setSelectedId, removeFunction } =
    useCustomFunctionStore()
  const fnList = Object.values(functions)

  const handleDragStart = useCallback(
    (e: React.DragEvent, name: string) => {
      e.dataTransfer.setData(
        'application/webjuggler-fields',
        JSON.stringify([`custom:${name}`]),
      )
      e.dataTransfer.effectAllowed = 'copy'
    },
    [],
  )

  const handleDelete = useCallback(() => {
    if (selectedId) removeFunction(selectedId)
  }, [selectedId, removeFunction])

  return (
    <div className="custom-series-section">
      <div className="custom-series-header">
        <span>Custom Series:</span>
        <div className="custom-series-buttons">
          <button onClick={onAdd} title="Add custom function">+</button>
          <button
            onClick={() => selectedId && onEdit(selectedId)}
            disabled={!selectedId}
            title="Edit selected"
          >
            ✎
          </button>
          <button
            onClick={handleDelete}
            disabled={!selectedId}
            title="Delete selected"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="custom-series-list">
        {fnList.map((fn) => (
          <div
            key={fn.id}
            className={`custom-series-item ${selectedId === fn.id ? 'selected' : ''}`}
            onClick={() => setSelectedId(fn.id)}
            onDoubleClick={() => onEdit(fn.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, fn.name)}
          >
            {fn.name}
          </div>
        ))}
        {fnList.length === 0 && (
          <div className="custom-series-empty">No custom series</div>
        )}
      </div>
    </div>
  )
}

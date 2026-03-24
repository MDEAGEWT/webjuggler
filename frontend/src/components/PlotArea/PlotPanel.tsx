import { useState, useCallback } from 'react'
import type { PlotNode } from '../../types'
import { useLayoutStore } from '../../stores/useLayoutStore'
import { useDataStore } from '../../stores/useDataStore'
import { useFileStore } from '../../stores/useFileStore'
import EmptyPlot from './EmptyPlot'
import TimeSeriesPlot from './TimeSeriesPlot'
import ContextMenu from '../ContextMenu'

interface Props {
  node: PlotNode
}

interface MenuPos {
  x: number
  y: number
}

export default function PlotPanel({ node }: Props) {
  const addSeries = useLayoutStore((s) => s.addSeries)
  const fetchFields = useDataStore((s) => s.fetchFields)
  const fileId = useFileStore((s) => s.currentFileId)
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/webjuggler-fields')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData('application/webjuggler-fields')
      if (!raw) return
      try {
        const fields = JSON.parse(raw) as string[]
        addSeries(node.id, fields)
        if (fileId) {
          fetchFields(fileId, fields)
        }
      } catch {
        // ignore malformed data
      }
    },
    [addSeries, fetchFields, fileId, node.id],
  )

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }, [])

  return (
    <div
      className="plot-panel"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
    >
      {node.series.length === 0 ? (
        <EmptyPlot />
      ) : (
        <TimeSeriesPlot panelId={node.id} series={node.series} />
      )}
      {menuPos && (
        <ContextMenu
          panelId={node.id}
          x={menuPos.x}
          y={menuPos.y}
          onClose={() => setMenuPos(null)}
        />
      )}
    </div>
  )
}

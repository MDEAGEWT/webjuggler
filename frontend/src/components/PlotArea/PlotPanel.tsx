import { useState, useCallback } from 'react'
import type { PlotNode } from '../../types'
import { useLayoutStore } from '../../stores/useLayoutStore'
import { useDataStore } from '../../stores/useDataStore'
import EmptyPlot from './EmptyPlot'
import TimeSeriesPlot from './TimeSeriesPlot'
import XYPlot from './XYPlot'
import ThreeDPlot from './ThreeDPlot'
import CompassView from './CompassView'
import AttitudeView from './AttitudeView'
import ContextMenu from '../ContextMenu'
import EditCurvesDialog from '../EditCurvesDialog'
import AxisConfigDialog from '../AxisConfigDialog'

interface Props {
  node: PlotNode
}

interface MenuPos {
  x: number
  y: number
}

export default function PlotPanel({ node }: Props) {
  const addSeries = useLayoutStore((s) => s.addSeries)
  const setFocusedPanel = useLayoutStore((s) => s.setFocusedPanel)
  const isFocused = useLayoutStore((s) => s.focusedPanelId === node.id)
  const fetchFields = useDataStore((s) => s.fetchFields)
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showAxisDialog, setShowAxisDialog] = useState(false)

  const handleClick = useCallback(() => {
    setFocusedPanel(node.id)
  }, [setFocusedPanel, node.id])

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
        // Fields now contain fileId prefix, fetchFields parses it
        const toFetch = fields.filter((f) => !f.startsWith('custom:'))
        if (toFetch.length > 0) fetchFields(toFetch)
      } catch {
        // ignore malformed data
      }
    },
    [addSeries, fetchFields, node.id],
  )

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }, [])

  return (
    <div
      className={`plot-panel${isFocused ? ' plot-panel-focused' : ''}`}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
    >
      {node.series.length === 0 ? (
        <EmptyPlot />
      ) : node.plotMode === 'attitude' && node.series.length >= 4 ? (
        <AttitudeView panelId={node.id} series={node.series} />
      ) : node.plotMode === 'xy' && node.series.length >= 2 ? (
        <XYPlot panelId={node.id} series={node.series} />
      ) : node.plotMode === '3d' && node.series.length >= 3 ? (
        <ThreeDPlot panelId={node.id} series={node.series} />
      ) : node.displayMode === 'compass' && node.series.length >= 1 ? (
        <CompassView panelId={node.id} series={node.series} />
      ) : (
        <TimeSeriesPlot panelId={node.id} series={node.series} />
      )}
      {menuPos && (
        <ContextMenu
          panelId={node.id}
          x={menuPos.x}
          y={menuPos.y}
          onClose={() => setMenuPos(null)}
          seriesCount={node.series.length}
          plotMode={node.plotMode}
          onEditCurves={node.series.length > 0 ? () => setShowEditDialog(true) : undefined}
          onAxisConfig={() => setShowAxisDialog(true)}
        />
      )}
      {showEditDialog && (
        <EditCurvesDialog
          panelId={node.id}
          series={node.series}
          onClose={() => setShowEditDialog(false)}
        />
      )}
      {showAxisDialog && (
        <AxisConfigDialog
          panelId={node.id}
          series={node.series}
          plotMode={node.plotMode}
          onClose={() => setShowAxisDialog(false)}
        />
      )}
    </div>
  )
}

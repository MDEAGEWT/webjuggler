import { useCallback } from 'react'
import { PLOT_COLORS } from '../../constants'
import { useFileStore } from '../../stores/useFileStore'
import { useLayoutStore } from '../../stores/useLayoutStore'
import { useSettingsStore } from '../../stores/useSettingsStore'

function getSeriesColor(index: number): string {
  return PLOT_COLORS[index % PLOT_COLORS.length]!
}

/** Extract a display label — show topic/field, with file prefix if multi-file */
function displayName(compositeField: string): string {
  if (compositeField.startsWith('custom:')) {
    return '[fn] ' + compositeField.substring(7)
  }
  const files = useFileStore.getState().files
  const colonIdx = compositeField.indexOf(':')
  if (colonIdx === -1) {
    return compositeField
  }
  const fileId = compositeField.substring(0, colonIdx)
  const fieldPath = compositeField.substring(colonIdx + 1) // "topic/field"

  if (files.length <= 1) return fieldPath

  const file = files.find((f) => f.fileId === fileId)
  const prefix = file ? file.shortName : fileId.substring(0, 8)
  return `[${prefix}] ${fieldPath}`
}

interface PlotLegendProps {
  panelId: string
  series: string[]
  hiddenSeries: Set<string>
  onToggleVisibility: (field: string) => void
  onRemoveSeries: (field: string) => void
}

export default function PlotLegend({
  series,
  hiddenSeries,
  onToggleVisibility,
  onRemoveSeries,
}: PlotLegendProps) {
  const colorOverrides = useLayoutStore((s) => s.colorOverrides)
  const showLegend = useSettingsStore((s) => s.showLegend)
  const legendPosition = useSettingsStore((s) => s.legendPosition)
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, field: string) => {
      e.preventDefault()
      e.stopPropagation()
      onRemoveSeries(field)
    },
    [onRemoveSeries],
  )

  if (series.length === 0 || !showLegend) return null

  return (
    <div className={`plot-legend plot-legend-${legendPosition}`}>
      {series.map((field, idx) => {
        const hidden = hiddenSeries.has(field)
        const color = colorOverrides[field] ?? getSeriesColor(idx)
        return (
          <div
            key={field}
            className={`legend-row${hidden ? ' legend-row-hidden' : ''}`}
            onClick={() => onToggleVisibility(field)}
            onContextMenu={(e) => handleContextMenu(e, field)}
            title={field}
          >
            <span
              className="legend-color"
              style={{ background: color }}
            />
            <span className="legend-name">{displayName(field)}</span>
          </div>
        )
      })}
    </div>
  )
}

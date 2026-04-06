import { useCallback } from 'react'
import { PLOT_COLORS } from '../../constants'

function hashColorIndex(path: string): number {
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    hash = (hash * 31 + path.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % PLOT_COLORS.length
}

function shortName(field: string): string {
  return field.split('/').slice(-1)[0] ?? field
}

function formatValue(v: number | null | undefined): string {
  if (v == null) return '\u2014'
  if (Number.isInteger(v)) return v.toString()
  return v.toPrecision(6)
}

interface PlotLegendProps {
  panelId: string
  series: string[]
  cursorValues: Record<string, number | null>
  hiddenSeries: Set<string>
  onToggleVisibility: (field: string) => void
  onRemoveSeries: (field: string) => void
}

export default function PlotLegend({
  series,
  cursorValues,
  hiddenSeries,
  onToggleVisibility,
  onRemoveSeries,
}: PlotLegendProps) {
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, field: string) => {
      e.preventDefault()
      e.stopPropagation()
      onRemoveSeries(field)
    },
    [onRemoveSeries],
  )

  if (series.length === 0) return null

  return (
    <div className="plot-legend">
      {series.map((field) => {
        const hidden = hiddenSeries.has(field)
        const color = PLOT_COLORS[hashColorIndex(field)]
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
            <span className="legend-name">{shortName(field)}</span>
            <span className="legend-value">
              {formatValue(cursorValues[field])}
            </span>
          </div>
        )
      })}
    </div>
  )
}

import { PLOT_COLORS } from '../constants'
import { useLayoutStore, selectActiveRoot } from '../stores/useLayoutStore'
import { useFileStore } from '../stores/useFileStore'
import type { LayoutNode, PlotNode } from '../types'

function getSeriesColor(index: number): string {
  return PLOT_COLORS[index % PLOT_COLORS.length]!
}

function seriesLabel(compositeField: string): string {
  if (compositeField.startsWith('custom:')) {
    return '[fn] ' + compositeField.substring(7)
  }
  const files = useFileStore.getState().files
  const colonIdx = compositeField.indexOf(':')
  if (colonIdx === -1) {
    return compositeField.split('/').slice(-1)[0] ?? compositeField
  }
  const fileId = compositeField.substring(0, colonIdx)
  const fieldPath = compositeField.substring(colonIdx + 1)
  const shortField = fieldPath.split('/').slice(-1)[0] ?? fieldPath

  if (files.length <= 1) return shortField

  const file = files.find((f) => f.fileId === fileId)
  const prefix = file ? file.shortName : fileId.substring(0, 8)
  return `[${prefix}] ${shortField}`
}

function findPlotNode(node: LayoutNode, id: string): PlotNode | null {
  if (node.type === 'plot') return node.id === id ? node : null
  return findPlotNode(node.children[0], id) ?? findPlotNode(node.children[1], id)
}

interface Props {
  panelId: string
  series: string[]
  onClose: () => void
}

const LINE_STYLE_OPTIONS: { value: 'lines' | 'dots' | 'lines-dots'; label: string }[] = [
  { value: 'lines', label: 'Lines' },
  { value: 'dots', label: 'Dots' },
  { value: 'lines-dots', label: 'Lines and Dots' },
]

const LINE_WIDTH_PRESETS = [1.0, 1.5, 2.0, 3.0]

export default function EditCurvesDialog({ panelId, series, onClose }: Props) {
  const colorOverrides = useLayoutStore((s) => s.colorOverrides)
  const setColorOverride = useLayoutStore((s) => s.setColorOverride)
  const setLineStyle = useLayoutStore((s) => s.setLineStyle)
  const setLineWidth = useLayoutStore((s) => s.setLineWidth)

  const root = useLayoutStore(selectActiveRoot)
  const plotNode = findPlotNode(root, panelId)
  const lineStyle = plotNode?.lineStyle ?? 'lines'
  const lineWidth = plotNode?.lineWidth ?? 1.5

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Edit Curves</h3>
          <button onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body">
          {series.map((field, idx) => {
            const currentColor =
              colorOverrides[field] ?? getSeriesColor(idx)
            return (
              <div className="edit-curve-row" key={field}>
                <div className="edit-curve-color-picker">
                  {PLOT_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`color-swatch${currentColor === c ? ' active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setColorOverride(field, c)}
                    />
                  ))}
                </div>
                <span className="edit-curve-name" title={field}>
                  {seriesLabel(field)}
                </span>
              </div>
            )
          })}

          <div className="edit-curve-section">
            <div className="edit-curve-section-label">Line Style</div>
            <div className="edit-curve-radio-group">
              {LINE_STYLE_OPTIONS.map((opt) => (
                <label key={opt.value} className="edit-curve-radio">
                  <input
                    type="radio"
                    name="lineStyle"
                    checked={lineStyle === opt.value}
                    onChange={() => setLineStyle(panelId, opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="edit-curve-section">
            <div className="edit-curve-section-label">Line Width</div>
            <div className="edit-curve-width-group">
              {LINE_WIDTH_PRESETS.map((w) => (
                <button
                  key={w}
                  className={`edit-curve-width-btn${lineWidth === w ? ' active' : ''}`}
                  onClick={() => setLineWidth(panelId, w)}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

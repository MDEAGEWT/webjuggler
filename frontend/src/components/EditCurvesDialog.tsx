import { PLOT_COLORS } from '../constants'
import { useLayoutStore } from '../stores/useLayoutStore'
import { useFileStore } from '../stores/useFileStore'

function getSeriesColor(index: number): string {
  return PLOT_COLORS[index % PLOT_COLORS.length]!
}

function seriesLabel(compositeField: string): string {
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

interface Props {
  panelId: string
  series: string[]
  onClose: () => void
}

export default function EditCurvesDialog({ series, onClose }: Props) {
  const colorOverrides = useLayoutStore((s) => s.colorOverrides)
  const setColorOverride = useLayoutStore((s) => s.setColorOverride)

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
        </div>
      </div>
    </div>
  )
}

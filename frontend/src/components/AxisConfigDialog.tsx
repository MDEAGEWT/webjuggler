import { useState } from 'react'
import { useLayoutStore, selectActiveRoot } from '../stores/useLayoutStore'
import type { LayoutNode, PlotNode } from '../types'

function findPlotNode(node: LayoutNode, id: string): PlotNode | null {
  if (node.type === 'plot') return node.id === id ? node : null
  return findPlotNode(node.children[0], id) ?? findPlotNode(node.children[1], id)
}

function fieldLabel(compositeField: string): string {
  if (compositeField.startsWith('custom:')) {
    return '[fn] ' + compositeField.substring(7)
  }
  const colonIdx = compositeField.indexOf(':')
  return colonIdx === -1 ? compositeField : compositeField.substring(colonIdx + 1)
}

interface Props {
  panelId: string
  series: string[]
  onClose: () => void
}

export default function AxisConfigDialog({ panelId, series, onClose }: Props) {
  const root = useLayoutStore(selectActiveRoot)
  const setAxisMapping = useLayoutStore((s) => s.setAxisMapping)
  const toggleAxisNegate = useLayoutStore((s) => s.toggleAxisNegate)

  const plotNode = findPlotNode(root, panelId)
  const axisNegate = plotNode?.axisNegate ?? [false, false, false]
  const axisMapping = plotNode?.axisMapping ?? [0, 1, 2] as [number, number, number]

  // Local state for pending changes before applying
  const [localMapping, setLocalMapping] = useState<[number, number, number]>(
    [...axisMapping] as [number, number, number]
  )

  const axisNames = ['X', 'Y', 'Z'] as const

  const handleSwap = (a: number, b: number) => {
    const next: [number, number, number] = [...localMapping]
    const tmp = next[a]!
    next[a] = next[b]!
    next[b] = tmp
    setLocalMapping(next)
    setAxisMapping(panelId, next)
  }

  const handleSelectChange = (axisIdx: number, seriesIdx: number) => {
    // If another axis already uses this seriesIdx, swap them
    const next: [number, number, number] = [...localMapping]
    const otherAxis = next.findIndex((v, i) => i !== axisIdx && v === seriesIdx)
    if (otherAxis !== -1) {
      next[otherAxis] = next[axisIdx]!
    }
    next[axisIdx] = seriesIdx
    setLocalMapping(next)
    setAxisMapping(panelId, next)
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>3D Axis Config</h3>
          <button onClick={onClose}>&times;</button>
        </div>
        <div className="dialog-body">
          {axisNames.map((name, axisIdx) => (
            <div className="axis-config-row" key={name}>
              <span className="axis-config-label">{name} axis:</span>
              <select
                className="axis-config-select"
                value={localMapping[axisIdx]}
                onChange={(e) => handleSelectChange(axisIdx, Number(e.target.value))}
              >
                {series.map((field, sIdx) => (
                  <option key={field} value={sIdx}>
                    {fieldLabel(field)}
                  </option>
                ))}
              </select>
              <button
                className={`axis-config-negate${axisNegate[axisIdx] ? ' axis-negated' : ''}`}
                onClick={() => toggleAxisNegate(panelId, axisIdx)}
                title={`${axisNegate[axisIdx] ? 'Un-negate' : 'Negate'} ${name} axis`}
              >
                {axisNegate[axisIdx] ? `\u2212${name}` : name}
              </button>
            </div>
          ))}

          <div className="axis-config-swaps">
            <button className="axis-config-swap-btn" onClick={() => handleSwap(0, 1)}>
              Swap X&#8596;Y
            </button>
            <button className="axis-config-swap-btn" onClick={() => handleSwap(1, 2)}>
              Swap Y&#8596;Z
            </button>
            <button className="axis-config-swap-btn" onClick={() => handleSwap(0, 2)}>
              Swap X&#8596;Z
            </button>
          </div>

          <div className="axis-config-close-row">
            <button className="axis-config-close-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useLayoutStore } from '../../stores/useLayoutStore'

interface Props {
  panelId: string
  axisLabels: string[]  // e.g. ['X', 'Y'] or ['X', 'Y', 'Z']
  axisNegate: boolean[]
}

export default function AxisControls({ panelId, axisLabels, axisNegate }: Props) {
  const toggleAxisNegate = useLayoutStore((s) => s.toggleAxisNegate)

  return (
    <div className="axis-controls">
      {axisLabels.map((label, i) => (
        <button
          key={i}
          className={`axis-ctrl-btn${axisNegate[i] ? ' axis-negated' : ''}`}
          onClick={() => toggleAxisNegate(panelId, i)}
          title={`${axisNegate[i] ? 'Un-negate' : 'Negate'} ${label} axis`}
        >
          {axisNegate[i] ? `−${label}` : label}
        </button>
      ))}
    </div>
  )
}

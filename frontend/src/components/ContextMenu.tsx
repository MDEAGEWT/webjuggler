import { useEffect, useRef } from 'react'
import { useLayoutStore } from '../stores/useLayoutStore'

interface Props {
  panelId: string
  x: number
  y: number
  onClose: () => void
}

export default function ContextMenu({ panelId, x, y, onClose }: Props) {
  const splitPanel = useLayoutStore((s) => s.splitPanel)
  const clearSeries = useLayoutStore((s) => s.clearSeries)
  const closePanel = useLayoutStore((s) => s.closePanel)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  function handle(action: () => void) {
    action()
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
    >
      <div
        className="context-menu-item"
        onClick={() => handle(() => splitPanel(panelId, 'vertical'))}
      >
        Split Vertical <kbd>V</kbd>
      </div>
      <div
        className="context-menu-item"
        onClick={() => handle(() => splitPanel(panelId, 'horizontal'))}
      >
        Split Horizontal <kbd>H</kbd>
      </div>
      <div className="context-menu-separator" />
      <div
        className="context-menu-item"
        onClick={() => handle(() => clearSeries(panelId))}
      >
        Clear Series
      </div>
      <div
        className="context-menu-item context-menu-item-danger"
        onClick={() => handle(() => closePanel(panelId))}
      >
        Close Panel
      </div>
    </div>
  )
}

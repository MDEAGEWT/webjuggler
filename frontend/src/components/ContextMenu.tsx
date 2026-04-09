import { useEffect, useRef } from 'react'
import { useLayoutStore } from '../stores/useLayoutStore'

interface Props {
  panelId: string
  x: number
  y: number
  onClose: () => void
  seriesCount: number
  plotMode: string
  onEditCurves?: () => void
  onAxisConfig?: () => void
}

export default function ContextMenu({ panelId, x, y, onClose, seriesCount, plotMode, onEditCurves, onAxisConfig }: Props) {
  const splitPanel = useLayoutStore((s) => s.splitPanel)
  const clearSeries = useLayoutStore((s) => s.clearSeries)
  const closePanel = useLayoutStore((s) => s.closePanel)
  const setPlotMode = useLayoutStore((s) => s.setPlotMode)
  const setDisplayMode = useLayoutStore((s) => s.setDisplayMode)
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
      {seriesCount > 0 && (
        <>
          <div className="context-menu-separator" />
          <div className="context-menu-item context-menu-has-submenu">
            <span>View Mode</span><span className="context-menu-arrow" />
            <div className="context-menu-submenu">
              <div
                className={`context-menu-item${plotMode === 'timeseries' ? ' context-menu-item-active' : ''}`}
                onClick={() => handle(() => setPlotMode(panelId, 'timeseries'))}
              >
                Timeseries
              </div>
              {seriesCount >= 2 && (
                <div
                  className={`context-menu-item${plotMode === 'xy' ? ' context-menu-item-active' : ''}`}
                  onClick={() => handle(() => setPlotMode(panelId, 'xy'))}
                >
                  XY Plot
                </div>
              )}
              {seriesCount >= 3 && (
                <div
                  className={`context-menu-item${plotMode === '3d' ? ' context-menu-item-active' : ''}`}
                  onClick={() => handle(() => setPlotMode(panelId, '3d'))}
                >
                  3D Plot
                </div>
              )}
              {seriesCount >= 4 && (
                <div
                  className={`context-menu-item${plotMode === 'attitude' ? ' context-menu-item-active' : ''}`}
                  onClick={() => handle(() => setPlotMode(panelId, 'attitude'))}
                >
                  Attitude
                </div>
              )}
              <div
                className="context-menu-item"
                onClick={() => handle(() => setDisplayMode(panelId, 'compass'))}
              >
                Compass
              </div>
            </div>
          </div>
          {(plotMode === 'xy' || plotMode === '3d') && onAxisConfig && (
            <div
              className="context-menu-item"
              onClick={() => handle(() => onAxisConfig())}
            >
              Axis Config...
            </div>
          )}
        </>
      )}
      <div className="context-menu-separator" />
      {onEditCurves && (
        <div
          className="context-menu-item"
          onClick={() => handle(() => onEditCurves())}
        >
          Edit Curves...
        </div>
      )}
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

import { useSettingsStore } from '../stores/useSettingsStore'

const CURSOR_MODE_LABELS = {
  off: 'Cursor: OFF (playback only)',
  point: 'Cursor: Point (nearest data point)',
  time: 'Cursor: Time (move tracker)',
} as const

const CURSOR_MODE_ICONS = {
  off: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  point: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  ),
  time: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      <path d="M13 13l6 6" />
    </svg>
  ),
} as const

export default function RightSidebar() {
  const { syncZoom, showCursorValues, cursorMode, toggleSyncZoom, toggleCursorValues, cycleCursorMode } = useSettingsStore()

  return (
    <div className="right-sidebar">
      <button
        className={`right-sidebar-btn ${syncZoom ? 'active' : ''}`}
        onClick={toggleSyncZoom}
        title={syncZoom ? 'Zoom sync: ON' : 'Zoom sync: OFF'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </button>
      <button
        className={`right-sidebar-btn ${showCursorValues ? 'active' : ''}`}
        onClick={toggleCursorValues}
        title={showCursorValues ? 'Cursor values: ON' : 'Cursor values: OFF'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      </button>
      <button
        className={`right-sidebar-btn ${cursorMode !== 'off' ? 'active' : ''}`}
        onClick={cycleCursorMode}
        title={CURSOR_MODE_LABELS[cursorMode]}
      >
        {CURSOR_MODE_ICONS[cursorMode]}
      </button>
    </div>
  )
}

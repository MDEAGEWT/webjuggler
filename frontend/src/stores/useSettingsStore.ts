import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CursorMode = 'off' | 'point' | 'time'
export type LegendPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

interface SettingsState {
  syncZoom: boolean
  showCursorValues: boolean
  cursorMode: CursorMode
  timeMode: 'boot' | 'gps'
  showLegend: boolean
  legendPosition: LegendPosition
  toggleSyncZoom: () => void
  toggleCursorValues: () => void
  setCursorMode: (mode: CursorMode) => void
  cycleCursorMode: () => void
  setTimeMode: (mode: 'boot' | 'gps') => void
  toggleLegend: () => void
  cycleLegendPosition: () => void
}

const CURSOR_MODES: CursorMode[] = ['off', 'point', 'time']

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      syncZoom: true,
      showCursorValues: true,
      cursorMode: 'off',
      timeMode: 'boot' as const,
      showLegend: true,
      legendPosition: 'top-right' as LegendPosition,
      toggleSyncZoom: () => set(s => ({ syncZoom: !s.syncZoom })),
      toggleCursorValues: () => set(s => ({ showCursorValues: !s.showCursorValues })),
      setCursorMode: (mode) => set({ cursorMode: mode }),
      cycleCursorMode: () => set(s => {
        const idx = CURSOR_MODES.indexOf(s.cursorMode)
        return { cursorMode: CURSOR_MODES[(idx + 1) % CURSOR_MODES.length]! }
      }),
      setTimeMode: (mode) => {
        set({ timeMode: mode })
        import('./useDataStore').then((m) => m.useDataStore.getState().recomputeAdjusted())
      },
      toggleLegend: () => set((s) => {
        // Cycle: top-right → top-left → bottom-left → bottom-right → hidden → top-right → ...
        if (!s.showLegend) return { showLegend: true, legendPosition: 'top-right' as LegendPosition }
        const positions: LegendPosition[] = ['top-right', 'top-left', 'bottom-left', 'bottom-right']
        const idx = positions.indexOf(s.legendPosition)
        if (idx === positions.length - 1) return { showLegend: false }
        return { legendPosition: positions[idx + 1]! }
      }),
      cycleLegendPosition: () => {},  // unused, kept for interface compat
    }),
    { name: 'webjuggler-settings' }
  )
)

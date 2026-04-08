import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CursorMode = 'off' | 'point' | 'time'

interface SettingsState {
  syncZoom: boolean
  showCursorValues: boolean
  cursorMode: CursorMode  // off=playback only, point=nearest point hover, time=move time tracker
  toggleSyncZoom: () => void
  toggleCursorValues: () => void
  setCursorMode: (mode: CursorMode) => void
  cycleCursorMode: () => void
}

const CURSOR_MODES: CursorMode[] = ['off', 'point', 'time']

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      syncZoom: true,
      showCursorValues: true,
      cursorMode: 'off',
      toggleSyncZoom: () => set(s => ({ syncZoom: !s.syncZoom })),
      toggleCursorValues: () => set(s => ({ showCursorValues: !s.showCursorValues })),
      setCursorMode: (mode) => set({ cursorMode: mode }),
      cycleCursorMode: () => set(s => {
        const idx = CURSOR_MODES.indexOf(s.cursorMode)
        return { cursorMode: CURSOR_MODES[(idx + 1) % CURSOR_MODES.length]! }
      }),
    }),
    { name: 'webjuggler-settings' }
  )
)

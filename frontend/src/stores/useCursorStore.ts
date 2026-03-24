import { create } from 'zustand'

interface CursorState {
  timestamp: number | null
  setCursor: (timestamp: number | null) => void
}

export const useCursorStore = create<CursorState>((set) => ({
  timestamp: null,
  setCursor: (timestamp) => set({ timestamp }),
}))

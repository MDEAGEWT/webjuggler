import { create } from 'zustand'

interface ZoomState {
  xMin: number | null
  xMax: number | null
  sourceId: string | null
  setRange: (xMin: number | null, xMax: number | null, sourceId: string) => void
  resetRange: () => void
}

export const useZoomStore = create<ZoomState>((set) => ({
  xMin: null,
  xMax: null,
  sourceId: null,
  setRange: (xMin, xMax, sourceId) => set({ xMin, xMax, sourceId }),
  resetRange: () => set({ xMin: null, xMax: null, sourceId: null }),
}))

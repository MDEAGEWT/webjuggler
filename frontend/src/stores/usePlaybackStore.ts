import { create } from 'zustand'

interface PlaybackState {
  isPlaying: boolean
  speed: number
  timeRange: { min: number; max: number } | null
  play: () => void
  pause: () => void
  togglePlay: () => void
  setSpeed: (speed: number) => void
  setTimeRange: (min: number, max: number) => void
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  isPlaying: false,
  speed: 1,
  timeRange: null,

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setSpeed: (speed) => set({ speed }),
  setTimeRange: (min, max) => set({ timeRange: { min, max } }),
}))

import { create } from 'zustand'
import { getConfig } from '../api/config'

interface ConfigState {
  mode: 'solo' | 'nas'
  nextcloudUrl: string
  loaded: boolean
  loadConfig: () => Promise<void>
}

export const useConfigStore = create<ConfigState>((set) => ({
  mode: 'solo',
  nextcloudUrl: '',
  loaded: false,
  loadConfig: async () => {
    try {
      const config = await getConfig()
      set({ mode: config.mode, nextcloudUrl: config.nextcloudUrl, loaded: true })
      if (config.mode === 'solo') {
        localStorage.setItem('token', 'solo')
        localStorage.setItem('username', 'local')
        const { useAuthStore } = await import('./useAuthStore')
        useAuthStore.getState().setAuth('solo', 'local')
      }
    } catch {
      set({ loaded: true })
    }
  },
}))

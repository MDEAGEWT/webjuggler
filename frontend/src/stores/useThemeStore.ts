import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  theme: 'dark' | 'light'
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      toggleTheme: () => set(state => {
        const next = state.theme === 'dark' ? 'light' : 'dark'
        document.documentElement.dataset.theme = next
        return { theme: next }
      }),
    }),
    { name: 'webjuggler-theme' }
  )
)

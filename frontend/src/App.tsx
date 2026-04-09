import { useEffect } from 'react'
import { useAuthStore } from './stores/useAuthStore'
import { useLayoutStore, selectActiveRoot } from './stores/useLayoutStore'
import { useThemeStore } from './stores/useThemeStore'
import { usePlaybackStore } from './stores/usePlaybackStore'
import LoginPage from './components/LoginPage'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar/Sidebar'
import SplitLayout from './components/PlotArea/SplitLayout'
import PlaybackBar from './components/PlaybackBar'
import RightSidebar from './components/RightSidebar'
import ToastContainer from './components/ToastContainer'
import TabBar from './components/TabBar'

export default function App() {
  const token = useAuthStore((s) => s.token)
  const root = useLayoutStore(selectActiveRoot)

  // Apply persisted theme on mount
  useEffect(() => {
    document.documentElement.dataset.theme = useThemeStore.getState().theme
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      // Space = toggle playback
      if (e.key === ' ') {
        e.preventDefault()
        usePlaybackStore.getState().togglePlay()
        return
      }

      // Undo/Redo — works even without a focused panel
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useLayoutStore.getState().undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z' && e.shiftKey))) {
        e.preventDefault()
        useLayoutStore.getState().redo()
        return
      }

      const { focusedPanelId, splitPanel, clearSeries } = useLayoutStore.getState()
      if (!focusedPanelId) return

      switch (e.key) {
        case 'v': case 'V':
          splitPanel(focusedPanelId, 'vertical')
          break
        case 'h': case 'H':
          splitPanel(focusedPanelId, 'horizontal')
          break
        case 'Delete': case 'Backspace':
          clearSeries(focusedPanelId)
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!token) return <LoginPage />

  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        <Sidebar />
        <div className="plot-area">
          <TabBar />
          <div className="tab-content">
            <SplitLayout node={root} />
          </div>
        </div>
        <RightSidebar />
      </div>
      <PlaybackBar />
      <ToastContainer />
    </div>
  )
}

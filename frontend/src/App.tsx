import { useEffect } from 'react'
import { useAuthStore } from './stores/useAuthStore'
import { useLayoutStore } from './stores/useLayoutStore'
import LoginPage from './components/LoginPage'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar/Sidebar'
import SplitLayout from './components/PlotArea/SplitLayout'
import ToastContainer from './components/ToastContainer'

export default function App() {
  const token = useAuthStore((s) => s.token)
  const root = useLayoutStore((s) => s.root)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

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
          <SplitLayout node={root} />
        </div>
      </div>
      <ToastContainer />
    </div>
  )
}

import { useAuthStore } from './stores/useAuthStore'
import { useLayoutStore } from './stores/useLayoutStore'
import LoginPage from './components/LoginPage'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar/Sidebar'
import SplitLayout from './components/PlotArea/SplitLayout'

export default function App() {
  const token = useAuthStore((s) => s.token)
  const root = useLayoutStore((s) => s.root)

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
    </div>
  )
}

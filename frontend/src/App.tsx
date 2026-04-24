import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from './stores/useAuthStore'
import { useConfigStore } from './stores/useConfigStore'
import { useLayoutStore, selectActiveRoot } from './stores/useLayoutStore'
import { useFileStore } from './stores/useFileStore'
import { useThemeStore } from './stores/useThemeStore'
import { usePlaybackStore } from './stores/usePlaybackStore'
import { useToastStore } from './stores/useToastStore'
import { upload } from './api/files'
import LoginPage from './components/LoginPage'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar/Sidebar'
import SplitLayout from './components/PlotArea/SplitLayout'
import PlaybackBar from './components/PlaybackBar'
import RightSidebar from './components/RightSidebar'
import ToastContainer from './components/ToastContainer'
import TabBar from './components/TabBar'
import { CustomFunctionEditorTab } from './components/CustomFunction/CustomFunctionEditorTab'
import NasBrowser from './components/NasBrowser/NasBrowser'

export default function App() {
  const token = useAuthStore((s) => s.token)
  const { mode, loaded } = useConfigStore()
  const root = useLayoutStore(selectActiveRoot)
  const activeTab = useLayoutStore((s) =>
    s.tabs.find((t) => t.id === s.activeTabId)
  )
  const [authChecked, setAuthChecked] = useState(false)
  const authCheckStarted = useRef(false)

  // Apply persisted theme on mount
  useEffect(() => {
    document.documentElement.dataset.theme = useThemeStore.getState().theme
  }, [])

  useEffect(() => {
    useConfigStore.getState().loadConfig()
  }, [])

  // Validate an existing NAS-mode token on startup so an expired session
  // sends the user to LoginPage instead of rendering a broken main UI.
  // Ref guard (not state) so this effect cannot re-fire itself via its own
  // state update — prevents the "Maximum update depth exceeded" crash.
  useEffect(() => {
    if (!loaded || authCheckStarted.current) return
    authCheckStarted.current = true

    const current = useAuthStore.getState().token
    if (mode !== 'nas' || !current) {
      setAuthChecked(true)
      return
    }
    fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${current}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          useAuthStore.getState().logout()
        } else {
          const body = (await res.json()) as { token: string }
          const username = useAuthStore.getState().username ?? ''
          useAuthStore.getState().setAuth(body.token, username)
        }
      })
      .catch(() => {
        // Network error: leave state alone so the user can retry
      })
      .finally(() => setAuthChecked(true))
  }, [loaded, mode])

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

  const addFile = useFileStore((s) => s.addFile)
  const [draggingFile, setDraggingFile] = useState(false)

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDraggingFile(true)
    }
  }, [])

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    // Only hide when leaving the app container
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setDraggingFile(false)
    }
  }, [])

  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    setDraggingFile(false)
    // Ignore internal drag & drop (sidebar fields → plot panels)
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    const allFiles = Array.from(e.dataTransfer.files)
    if (allFiles.length === 0) return
    const ulgFiles = allFiles.filter((f) => f.name.endsWith('.ulg'))
    if (ulgFiles.length === 0) {
      useToastStore.getState().addToast('Only .ulg files are supported', 'error')
      return
    }
    const files = ulgFiles
    for (const file of files) {
      try {
        const info = await upload(file)
        await addFile(info.fileId, info.filename)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        useToastStore.getState().addToast(`Upload failed: ${msg}`, 'error')
      }
    }
  }, [addFile])

  if (!loaded || !authChecked) return <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>Loading...</div>

  if (mode === 'nas' && !token) return <LoginPage hideRegister />

  return (
    <div
      className="app"
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      {draggingFile && (
        <div className="file-drop-overlay">
          <div className="file-drop-message">Drop .ulg file(s) here</div>
        </div>
      )}
      <TopBar />
      <div className="workspace">
        <Sidebar />
        <div className="plot-area">
          <TabBar />
          <div className="tab-content">
            {activeTab?.type === 'nas-browser' ? (
              <NasBrowser tabId={activeTab.id} />
            ) : activeTab?.type === 'editor' ? (
              <CustomFunctionEditorTab
                editingId={activeTab.editingFunctionId ?? null}
                tabId={activeTab.id}
              />
            ) : (
              <SplitLayout node={root} />
            )}
          </div>
        </div>
        <RightSidebar />
      </div>
      <PlaybackBar />
      <ToastContainer />
    </div>
  )
}

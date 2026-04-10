import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from './stores/useAuthStore'
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

export default function App() {
  const token = useAuthStore((s) => s.token)
  const root = useLayoutStore(selectActiveRoot)
  const activeTab = useLayoutStore((s) =>
    s.tabs.find((t) => t.id === s.activeTabId)
  )

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

  if (!token) return <LoginPage />

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
            {activeTab?.type === 'editor' ? (
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

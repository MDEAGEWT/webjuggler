import { useRef } from 'react'
import { useAuthStore } from '../stores/useAuthStore'
import { useFileStore } from '../stores/useFileStore'
import { useToastStore } from '../stores/useToastStore'
import { useThemeStore } from '../stores/useThemeStore'
import { useConfigStore } from '../stores/useConfigStore'
import { useLayoutStore } from '../stores/useLayoutStore'
import { upload } from '../api/files'

export default function TopBar() {
  const username = useAuthStore((s) => s.username)
  const logout = useAuthStore((s) => s.logout)
  const files = useFileStore((s) => s.files)
  const addFile = useFileStore((s) => s.addFile)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const mode = useConfigStore((s) => s.mode)
  const addTab = useLayoutStore((s) => s.addTab)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const info = await upload(file)
      await addFile(info.fileId, info.filename)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      useToastStore.getState().addToast(`Upload failed: ${msg}`, 'error')
    }
    // Reset so same file can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="topbar-logo">WebJuggler</span>
        <button
          className="topbar-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ulg"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
        {mode === 'nas' && (
          <button className="topbar-btn" onClick={() => {
            const tabs = useLayoutStore.getState().tabs
            const existing = tabs.find((t) => (t.type as string) === 'nas-browser')
            if (existing) {
              useLayoutStore.getState().setActiveTab(existing.id)
            } else {
              addTab('nas-browser' as any, null, 'NAS Browser')
            }
          }}>
            NAS
          </button>
        )}
        {files.length > 0 && (
          <span className="topbar-filename">
            {files.length === 1
              ? files[0]!.filename
              : `${files.length} files loaded`}
          </span>
        )}
      </div>
      <div className="topbar-right">
        <button className="topbar-btn" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '\u2600' : '\u263E'}
        </button>
        {mode === 'nas' && (
          <>
            <span className="topbar-username">{username}</span>
            <button className="topbar-btn" onClick={logout}>Logout</button>
          </>
        )}
      </div>
    </div>
  )
}

import { useRef } from 'react'
import { useAuthStore } from '../stores/useAuthStore'
import { useFileStore } from '../stores/useFileStore'
import { upload } from '../api/files'

export default function TopBar() {
  const username = useAuthStore((s) => s.username)
  const logout = useAuthStore((s) => s.logout)
  const currentFilename = useFileStore((s) => s.currentFilename)
  const setFile = useFileStore((s) => s.setFile)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const info = await upload(file)
      await setFile(info.fileId, info.filename)
    } catch (err) {
      console.error('Upload failed:', err)
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
        {currentFilename && (
          <span className="topbar-filename">{currentFilename}</span>
        )}
      </div>
      <div className="topbar-right">
        <span className="topbar-username">{username}</span>
        <button className="topbar-btn" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  )
}

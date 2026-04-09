import { useState } from 'react'
import { useFileStore } from '../../stores/useFileStore'
import { useDataStore } from '../../stores/useDataStore'
import TopicTree from './TopicTree'
import { CustomSeriesSection } from './CustomSeriesSection'
import { CustomFunctionEditor } from '../CustomFunction/CustomFunctionEditor'

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [filter, setFilter] = useState('')
  const files = useFileStore((s) => s.files)
  const removeFile = useFileStore((s) => s.removeFile)
  const clearFileData = useDataStore((s) => s.clearFileData)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function toggleFileCollapse(fileId: string) {
    setCollapsedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }

  function handleRemoveFile(fileId: string) {
    removeFile(fileId)
    clearFileData(fileId)
  }

  if (collapsed) {
    return (
      <div className="sidebar sidebar-collapsed">
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
        >
          &#9654;
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">Topics</span>
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
          >
            &#9664;
          </button>
        </div>
        <input
          className="sidebar-filter"
          type="text"
          placeholder="Filter fields..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {files.length === 0 ? (
          <div className="sidebar-empty">Upload a file to see topics</div>
        ) : (
          files.map((file) => {
            const isFileCollapsed = collapsedFiles.has(file.fileId)
            return (
              <div key={file.fileId} className="file-group">
                <div
                  className="file-group-header"
                  onClick={() => toggleFileCollapse(file.fileId)}
                >
                  <span className="topic-arrow">
                    {isFileCollapsed ? '\u25B8' : '\u25BE'}
                  </span>
                  <span className="file-group-name" title={file.filename}>
                    {file.filename}
                  </span>
                  <button
                    className="file-group-remove"
                    title="Remove file"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveFile(file.fileId)
                    }}
                  >
                    &times;
                  </button>
                </div>
                {!isFileCollapsed && (
                  <TopicTree
                    topics={file.topics}
                    fileId={file.fileId}
                    filter={filter}
                  />
                )}
              </div>
            )
          })
        )}
        <CustomSeriesSection
          onAdd={() => { setEditingId(null); setEditorOpen(true) }}
          onEdit={(id) => { setEditingId(id); setEditorOpen(true) }}
        />
      </div>
      {editorOpen && (
        <CustomFunctionEditor
          editingId={editingId}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </>
  )
}

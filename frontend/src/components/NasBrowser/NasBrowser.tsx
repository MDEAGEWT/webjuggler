import { useState, useCallback, useEffect } from 'react'
import { browse, openFiles } from '../../api/nas'
import { useFileStore } from '../../stores/useFileStore'
import { useToastStore } from '../../stores/useToastStore'

interface Props {
  tabId: string
}

interface TreeNode {
  entries: { name: string; type: 'dir' | 'file'; size?: number }[]
  expanded: boolean
  summary: Record<string, any> | null
}

export default function NasBrowser({ tabId: _tabId }: Props) {
  const addFile = useFileStore((s) => s.addFile)
  const [tree, setTree] = useState<Record<string, TreeNode>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastSelected, setLastSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadDir('')
  }, [])

  const loadDir = useCallback(async (path: string) => {
    try {
      const res = await browse(path)
      setTree((prev) => ({
        ...prev,
        [path]: { entries: res.entries, expanded: true, summary: res.summary },
      }))
    } catch {
      useToastStore.getState().addToast('Failed to browse NAS', 'error')
    }
  }, [])

  const toggleDir = useCallback((path: string) => {
    if (tree[path]) {
      setTree((prev) => ({
        ...prev,
        [path]: { ...prev[path]!, expanded: !prev[path]!.expanded },
      }))
    } else {
      loadDir(path)
    }
  }, [tree, loadDir])

  const handleSelect = useCallback((filePath: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelected) {
      // Range select: add this file
      setSelected((prev) => {
        const next = new Set(prev)
        next.add(filePath)
        return next
      })
    } else if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(filePath)) next.delete(filePath)
        else next.add(filePath)
        return next
      })
      setLastSelected(filePath)
    } else {
      setSelected(new Set([filePath]))
      setLastSelected(filePath)
    }
  }, [lastSelected])

  const handleOpen = useCallback(async () => {
    if (selected.size === 0) return
    setLoading(true)
    try {
      const res = await openFiles(Array.from(selected))
      let successCount = 0
      for (const f of res.files) {
        if (f.fileId) {
          await addFile(f.fileId, f.filename)
          successCount++
        }
        if (f.error) {
          useToastStore.getState().addToast(`Failed: ${f.filename}`, 'error')
        }
      }
      if (successCount > 0) {
        useToastStore.getState().addToast(`Opened ${successCount} file${successCount > 1 ? 's' : ''}`, 'success')
      }
      setSelected(new Set())
    } catch {
      useToastStore.getState().addToast('Failed to open files', 'error')
    } finally {
      setLoading(false)
    }
  }, [selected, addFile])

  const renderEntries = (parentPath: string, depth: number): React.ReactNode[] => {
    const node = tree[parentPath]
    if (!node || !node.expanded) return []

    return node.entries.map((entry) => {
      const fullPath = parentPath ? `${parentPath}/${entry.name}` : entry.name
      const isUlg = entry.name.endsWith('.ulg')

      if (entry.type === 'dir') {
        const childNode = tree[fullPath]
        const isExpanded = childNode?.expanded ?? false
        return (
          <div key={fullPath}>
            <div
              className="nas-entry nas-dir"
              style={{ paddingLeft: depth * 16 + 8 }}
              onClick={() => toggleDir(fullPath)}
            >
              <span className="topic-arrow">{isExpanded ? '\u25BE' : '\u25B8'}</span>
              <span className="nas-name">{entry.name}</span>
              {childNode?.summary && (
                <span className="nas-summary">
                  {childNode.summary.drone_count} drones
                </span>
              )}
            </div>
            {isExpanded && renderEntries(fullPath, depth + 1)}
          </div>
        )
      }

      if (!isUlg) return null

      return (
        <div
          key={fullPath}
          className={`nas-entry nas-file ${selected.has(fullPath) ? 'nas-file-selected' : ''}`}
          style={{ paddingLeft: depth * 16 + 8 }}
          onClick={(e) => handleSelect(fullPath, e)}
        >
          <span className="nas-name">{entry.name}</span>
          {entry.size != null && (
            <span className="nas-size">{(entry.size / 1024 / 1024).toFixed(1)} MB</span>
          )}
        </div>
      )
    }).filter(Boolean) as React.ReactNode[]
  }

  return (
    <div className="nas-browser">
      <div className="nas-browser-content">
        <h3 style={{ color: 'var(--text-primary)', margin: '0 0 12px' }}>NAS Flight Logs</h3>
        <div className="nas-tree">
          {Object.keys(tree).length === 0 ? (
            <div className="nas-empty">Loading...</div>
          ) : (
            renderEntries('', 0)
          )}
        </div>
      </div>
      <div className="nas-browser-footer">
        <span className="nas-selected-count">
          {selected.size > 0 ? `${selected.size} file${selected.size > 1 ? 's' : ''} selected` : 'Select files to open'}
        </span>
        <button
          className="nas-open-btn"
          disabled={selected.size === 0 || loading}
          onClick={handleOpen}
        >
          {loading ? 'Opening...' : `Open${selected.size > 0 ? ` ${selected.size}` : ''} file${selected.size !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}

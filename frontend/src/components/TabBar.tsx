import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useLayoutStore } from '../stores/useLayoutStore'

export default function TabBar() {
  const tabs = useLayoutStore((s) => s.tabs)
  const activeTabId = useLayoutStore((s) => s.activeTabId)
  const setActiveTab = useLayoutStore((s) => s.setActiveTab)
  const addTab = useLayoutStore((s) => s.addTab)
  const closeTab = useLayoutStore((s) => s.closeTab)
  const renameTab = useLayoutStore((s) => s.renameTab)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingTabId])

  const handleDoubleClick = useCallback((tab: { id: string; name: string }) => {
    setEditingTabId(tab.id)
    setEditName(tab.name)
  }, [])

  const handleRenameCommit = useCallback(() => {
    if (editingTabId && editName.trim()) {
      renameTab(editingTabId, editName.trim())
    }
    setEditingTabId(null)
  }, [editingTabId, editName, renameTab])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameCommit()
    if (e.key === 'Escape') setEditingTabId(null)
  }, [handleRenameCommit])

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
          onDoubleClick={() => handleDoubleClick(tab)}
        >
          {editingTabId === tab.id ? (
            <input
              ref={inputRef}
              className="tab-rename-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRenameCommit}
              onKeyDown={handleRenameKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="tab-label">{tab.name}</span>
          )}
          <span
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
            >
              &times;
            </span>
        </div>
      ))}
      <div className="tab-add" onClick={() => addTab('plot')}>
        +
      </div>
    </div>
  )
}

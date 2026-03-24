import { useState } from 'react'
import { useFileStore } from '../../stores/useFileStore'
import TopicTree from './TopicTree'

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [filter, setFilter] = useState('')
  const topics = useFileStore((s) => s.topics)

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
      {topics.length === 0 ? (
        <div className="sidebar-empty">Upload a file to see topics</div>
      ) : (
        <TopicTree topics={topics} filter={filter} />
      )}
    </div>
  )
}

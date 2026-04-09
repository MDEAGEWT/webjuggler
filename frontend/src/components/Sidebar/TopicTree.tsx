import { useState } from 'react'
import type { Topic } from '../../types'
import FieldItem from './FieldItem'

interface Props {
  topics: Topic[]
  fileId: string
  filter: string
}

export default function TopicTree({ topics, fileId, filter }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set())
  const [lastSelected, setLastSelected] = useState<string | null>(null)
  const lowerFilter = filter.toLowerCase()

  // Flat list of all visible field paths (for range selection)
  function getAllVisiblePaths(): string[] {
    const paths: string[] = []
    for (const topic of topics) {
      if (expanded[topic.name]) {
        for (const field of topic.fields) {
          paths.push(`${fileId}:${topic.name}${field}`)
        }
      }
    }
    return paths
  }

  function toggleExpand(name: string) {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  function handleSelect(fieldPath: string, mode: 'single' | 'toggle' | 'range') {
    if (mode === 'range' && lastSelected) {
      // Select all between lastSelected and fieldPath
      const allPaths = getAllVisiblePaths()
      const idxA = allPaths.indexOf(lastSelected)
      const idxB = allPaths.indexOf(fieldPath)
      if (idxA !== -1 && idxB !== -1) {
        const from = Math.min(idxA, idxB)
        const to = Math.max(idxA, idxB)
        setSelectedFields((prev) => {
          const next = new Set(prev)
          for (let i = from; i <= to; i++) {
            next.add(allPaths[i]!)
          }
          return next
        })
      }
    } else if (mode === 'toggle') {
      setSelectedFields((prev) => {
        const next = new Set(prev)
        if (next.has(fieldPath)) next.delete(fieldPath)
        else next.add(fieldPath)
        return next
      })
      setLastSelected(fieldPath)
    } else {
      setSelectedFields(new Set([fieldPath]))
      setLastSelected(fieldPath)
    }
  }

  const filtered = topics
    .map((topic) => {
      if (!lowerFilter) return topic
      const matchingFields = topic.fields.filter((f) =>
        `${topic.name}${f}`.toLowerCase().includes(lowerFilter),
      )
      if (
        matchingFields.length === 0 &&
        !topic.name.toLowerCase().includes(lowerFilter)
      ) {
        return null
      }
      return { ...topic, fields: matchingFields.length > 0 ? matchingFields : topic.fields }
    })
    .filter((t): t is Topic => t !== null)

  return (
    <div className="topic-tree">
      {filtered.map((topic) => {
        const isExpanded = expanded[topic.name] ?? false
        return (
          <div key={topic.name} className="topic-group">
            <div
              className="topic-header"
              onClick={() => toggleExpand(topic.name)}
            >
              <span className="topic-arrow">
                {isExpanded ? '\u25BE' : '\u25B8'}
              </span>
              <span className="topic-name">{topic.name}</span>
              <span className="topic-count">{topic.dataPoints}</span>
            </div>
            {isExpanded && (
              <div className="topic-fields">
                {topic.fields.map((field) => {
                  // Composite path: "fileId:topicName/fieldName"
                  const fullPath = `${fileId}:${topic.name}${field}`
                  return (
                    <FieldItem
                      key={fullPath}
                      fieldPath={fullPath}
                      fieldName={field}
                      selected={selectedFields.has(fullPath)}
                      allSelected={Array.from(selectedFields)}
                      onSelect={(mode) =>
                        handleSelect(fullPath, mode)
                      }
                    />
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

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
  const lowerFilter = filter.toLowerCase()

  function toggleExpand(name: string) {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  function toggleSelect(fieldPath: string, ctrlKey: boolean) {
    setSelectedFields((prev) => {
      const next = new Set(ctrlKey ? prev : [])
      if (next.has(fieldPath)) {
        next.delete(fieldPath)
      } else {
        next.add(fieldPath)
      }
      return next
    })
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
                      onSelect={(ctrlKey) =>
                        toggleSelect(fullPath, ctrlKey)
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

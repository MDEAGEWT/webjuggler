import React from 'react'
import { functionTemplates, type FunctionTemplate } from './functionTemplates'

interface Props {
  selected: string | null
  onSelect: (template: FunctionTemplate) => void
}

export const FunctionLibrary: React.FC<Props> = ({ selected, onSelect }) => {
  return (
    <div className="function-library">
      <label className="fn-editor-label">Function library:</label>
      <div className="function-library-list">
        {functionTemplates.map((t) => (
          <div
            key={t.name}
            className={`function-library-item ${selected === t.name ? 'selected' : ''}`}
            onClick={() => onSelect(t)}
            title={t.description}
          >
            {t.name}
          </div>
        ))}
      </div>
    </div>
  )
}

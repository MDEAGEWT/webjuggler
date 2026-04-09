import React, { useState, useCallback, useEffect } from 'react'
import { compile } from 'mathjs/number'
import { useCustomFunctionStore } from '../../stores/useCustomFunctionStore'
import { useDataStore } from '../../stores/useDataStore'
import { useLayoutStore } from '../../stores/useLayoutStore'
import { FunctionLibrary } from './FunctionLibrary'
import type { FunctionTemplate } from './functionTemplates'

interface Props {
  editingId: string | null  // null = create mode
  tabId: string
}

export const CustomFunctionEditorTab: React.FC<Props> = ({ editingId, tabId }) => {
  const { functions, addFunction, updateFunction } = useCustomFunctionStore()
  const fetchFields = useDataStore((s) => s.fetchFields)
  const closeTab = useLayoutStore((s) => s.closeTab)
  const renameTab = useLayoutStore((s) => s.renameTab)

  const existing = editingId ? functions[editingId] : null

  const [name, setName] = useState(existing?.name ?? '')
  const [mainInput, setMainInput] = useState(existing?.mainInput ?? '')
  const [additionalInputs, setAdditionalInputs] = useState<string[]>(
    existing?.additionalInputs ?? [],
  )
  const [expression, setExpression] = useState(existing?.expression ?? 'value')
  const [selectedLibrary, setSelectedLibrary] = useState<string | null>(
    existing?.libraryFunction ?? null,
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (existing) {
      setName(existing.name)
      setMainInput(existing.mainInput)
      setAdditionalInputs(existing.additionalInputs)
      setExpression(existing.expression)
      setSelectedLibrary(existing.libraryFunction ?? null)
    }
  }, [existing])

  const handleDrop = useCallback(
    (e: React.DragEvent, target: 'main' | 'additional') => {
      e.preventDefault()
      e.stopPropagation()
      const raw = e.dataTransfer.getData('application/webjuggler-fields')
      if (!raw) return
      try {
        const fields = JSON.parse(raw) as string[]
        // Prevent circular reference: reject custom series as inputs
        const filtered = fields.filter((f) => !f.startsWith('custom:'))
        if (filtered.length === 0) return
        if (target === 'main') {
          setMainInput(filtered[0]!)
        } else {
          setAdditionalInputs((prev) => [...prev, ...filtered])
        }
      } catch { /* ignore */ }
    },
    [],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleLibrarySelect = useCallback((template: FunctionTemplate) => {
    setExpression(template.expression)
    setSelectedLibrary(template.name)
    setError(null)
  }, [])

  const removeAdditionalInput = useCallback((index: number) => {
    setAdditionalInputs((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const formatFieldLabel = (compositeKey: string): string => {
    const colonIdx = compositeKey.indexOf(':')
    return colonIdx >= 0 ? compositeKey.substring(colonIdx + 1) : compositeKey
  }

  const validate = (): string | null => {
    if (!name.trim()) return 'Name is required'
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) return 'Name: only letters, numbers, _, - allowed'
    if (!mainInput) return 'Main input timeseries is required'
    if (!expression.trim()) return 'Expression is required'

    const allFns = Object.values(functions)
    const duplicate = allFns.find(
      (f) => f.name === name && f.id !== editingId,
    )
    if (duplicate) return `Name "${name}" already exists`

    try {
      compile(expression)
    } catch (e: any) {
      return `Expression error: ${e.message}`
    }
    return null
  }

  const handleCancel = () => closeTab(tabId)

  const handleSubmit = useCallback(async () => {
    const err = validate()
    if (err) {
      setError(err)
      return
    }

    const def = {
      name,
      expression,
      mainInput,
      additionalInputs,
      libraryFunction: selectedLibrary ?? undefined,
    }

    // Ensure input data is fetched BEFORE creating/updating
    const toFetch = [mainInput, ...additionalInputs].filter(
      (f) => !f.startsWith('custom:'),
    )
    if (toFetch.length > 0) await fetchFields(toFetch)

    if (editingId) {
      updateFunction(editingId, def)
    } else {
      addFunction(def)
    }
    renameTab(tabId, `fn: ${name}`)
    // Do NOT close the tab — it stays open per spec
  }, [
    name, expression, mainInput, additionalInputs, selectedLibrary,
    editingId, addFunction, updateFunction, fetchFields, renameTab, tabId, functions,
  ])

  return (
    <div className="fn-editor-tab">
      <div className="fn-editor-tab-content">

        <label className="fn-editor-label">Name:</label>
        <input
          className="fn-editor-input"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null) }}
          placeholder="my_custom_series"
        />

        <label className="fn-editor-label">
          Input timeseries (&rarr; time, value):
        </label>
        <div
          className="fn-editor-dropzone"
          onDrop={(e) => handleDrop(e, 'main')}
          onDragOver={handleDragOver}
        >
          {mainInput
            ? formatFieldLabel(mainInput)
            : 'drag & drop here'}
        </div>

        <label className="fn-editor-label">
          Additional source timeseries (&rarr; v1, v2, v3...):
        </label>
        <div
          className="fn-editor-dropzone fn-editor-additional"
          onDrop={(e) => handleDrop(e, 'additional')}
          onDragOver={handleDragOver}
        >
          {additionalInputs.length === 0
            ? 'drag & drop additional series here'
            : additionalInputs.map((inp, i) => (
                <div key={i} className="fn-additional-item">
                  <span>v{i + 1}: {formatFieldLabel(inp)}</span>
                  <button onClick={() => removeAdditionalInput(i)}>&times;</button>
                </div>
              ))}
        </div>

        <FunctionLibrary
          selected={selectedLibrary}
          onSelect={handleLibrarySelect}
        />

        <label className="fn-editor-label">Expression:</label>
        <textarea
          className="fn-editor-textarea"
          value={expression}
          onChange={(e) => { setExpression(e.target.value); setError(null); setSelectedLibrary(null) }}
          rows={6}
          spellCheck={false}
        />

        {error && <div className="fn-editor-error">{error}</div>}

        <div className="fn-editor-actions">
          <button onClick={handleCancel}>Cancel</button>
          <button className="fn-editor-submit" onClick={handleSubmit}>
            {editingId ? 'Save' : 'Create'}
          </button>
        </div>

      </div>
    </div>
  )
}

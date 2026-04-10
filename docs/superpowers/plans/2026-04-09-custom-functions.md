# Custom Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PlotJuggler-style custom function support — users create new time series from math expressions and a 10-function built-in library.

**Architecture:** mathjs/number for expression evaluation (compile once, evaluate per-point). New Zustand store for function definitions (persisted to localStorage). Results stored in existing data store with `"custom:{name}"` keys. Sidebar section + modal editor for UI.

**Tech Stack:** mathjs/number, React 18, TypeScript, Zustand (persist middleware)

**Spec:** `docs/superpowers/specs/2026-04-09-custom-functions-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/stores/useCustomFunctionStore.ts` | Function definitions, evaluation engine, persistence |
| Create | `frontend/src/components/CustomFunction/functionTemplates.ts` | 10 library templates (name, expression, requiredInputs) |
| Create | `frontend/src/components/CustomFunction/evaluateExpression.ts` | mathjs compile + per-point evaluation loop |
| Create | `frontend/src/components/CustomFunction/CustomFunctionEditor.tsx` | Modal editor dialog |
| Create | `frontend/src/components/CustomFunction/FunctionLibrary.tsx` | Library list component |
| Create | `frontend/src/components/Sidebar/CustomSeriesSection.tsx` | Sidebar [+][edit][delete] section |
| Modify | `frontend/src/stores/useDataStore.ts` | Guard `fetchFields`/`clearFileData` for `"custom:"` keys; add `setCustomData`/`removeCustomData` |
| Modify | `frontend/src/components/PlotArea/PlotPanel.tsx` | Guard drop handler for custom keys |
| Modify | `frontend/src/components/PlotArea/TimeSeriesPlot.tsx` | Guard `seriesLabel` for custom keys |
| Modify | `frontend/src/components/PlotArea/PlotLegend.tsx` | Guard `displayName` for custom keys |
| Modify | `frontend/src/components/EditCurvesDialog.tsx` | Guard `seriesLabel` for custom keys |
| Modify | `frontend/src/components/AxisConfigDialog.tsx` | Guard `fieldLabel` for custom keys |
| Modify | `frontend/src/components/Sidebar/Sidebar.tsx` | Render CustomSeriesSection |
| Modify | `frontend/src/types/index.ts` | Add CustomFunctionDef type |
| Modify | `frontend/package.json` | Add mathjs dependency |

---

## Task 1: Install mathjs and add types

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Install mathjs**

```bash
cd frontend && npm install mathjs
```

- [ ] **Step 2: Add CustomFunctionDef type to types/index.ts**

Add after existing types:

```typescript
export interface CustomFunctionDef {
  id: string
  name: string
  expression: string
  mainInput: string            // "fileId:topic/field"
  additionalInputs: string[]   // ["fileId:topic/field", ...]
  libraryFunction?: string
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/types/index.ts
git commit -m "feat: add mathjs dependency and CustomFunctionDef type"
```

---

## Task 2: Function templates and expression evaluator

**Files:**
- Create: `frontend/src/components/CustomFunction/functionTemplates.ts`
- Create: `frontend/src/components/CustomFunction/evaluateExpression.ts`

- [ ] **Step 1: Create functionTemplates.ts**

```typescript
export interface FunctionTemplate {
  name: string
  expression: string
  description: string
  requiredInputs: number  // 0 = value only, N = needs v1..vN
}

export const functionTemplates: FunctionTemplate[] = [
  {
    name: 'backward_difference_derivative',
    expression: '(value - prev_value) / (time - prev_time)',
    description: 'First derivative (backward difference)',
    requiredInputs: 0,
  },
  {
    name: 'central_difference_derivative',
    expression: '(next_value - prev_value) / (next_time - prev_time)',
    description: 'First derivative (central difference)',
    requiredInputs: 0,
  },
  {
    name: 'integral',
    expression: 'acc + value * (time - prev_time)',
    description: 'Cumulative integral (left Riemann sum)',
    requiredInputs: 0,
  },
  {
    name: 'quat_to_pitch',
    expression: 'asin(-2 * (v1 * v3 - value * v2))',
    description: 'Quaternion to pitch angle (rad)',
    requiredInputs: 3,
  },
  {
    name: 'quat_to_roll',
    expression: 'atan2(2 * (value * v1 + v2 * v3), 1 - 2 * (v1^2 + v2^2))',
    description: 'Quaternion to roll angle (rad)',
    requiredInputs: 3,
  },
  {
    name: 'quat_to_yaw',
    expression: 'atan2(2 * (value * v3 + v1 * v2), 1 - 2 * (v2^2 + v3^2))',
    description: 'Quaternion to yaw angle (rad)',
    requiredInputs: 3,
  },
  {
    name: 'rad_to_deg',
    expression: 'value * 180 / pi',
    description: 'Radians to degrees',
    requiredInputs: 0,
  },
  {
    name: 'remove_offset',
    expression: 'value - first_value',
    description: 'Remove initial offset',
    requiredInputs: 0,
  },
  {
    name: 'dist_2d',
    expression: 'sqrt((value - v2)^2 + (v1 - v3)^2)',
    description: '2D Euclidean distance between (value,v1) and (v2,v3)',
    requiredInputs: 3,
  },
  {
    name: 'dist_3d',
    expression: 'sqrt((value - v3)^2 + (v1 - v4)^2 + (v2 - v5)^2)',
    description: '3D Euclidean distance between (value,v1,v2) and (v3,v4,v5)',
    requiredInputs: 5,
  },
]
```

- [ ] **Step 2: Create evaluateExpression.ts**

This is the core evaluation engine. Uses `mathjs.compile()` once, then loops.

```typescript
import { compile } from 'mathjs/number'
import type { FieldData } from '../../types'

/**
 * Binary search for nearest timestamp index in a sorted Float64Array.
 */
function nearestIndex(timestamps: Float64Array, target: number): number {
  let lo = 0
  let hi = timestamps.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (timestamps[mid] < target) lo = mid + 1
    else hi = mid
  }
  // Check if lo-1 is closer
  if (lo > 0 && Math.abs(timestamps[lo - 1] - target) < Math.abs(timestamps[lo] - target)) {
    return lo - 1
  }
  return lo
}

export interface EvaluateInput {
  expression: string
  main: FieldData
  additional: FieldData[]  // v1, v2, v3, ...
}

export function evaluateExpression(input: EvaluateInput): FieldData {
  const { expression, main, additional } = input
  const len = main.timestamps.length
  const resultValues = new Float64Array(len)
  const compiled = compile(expression)

  const isIntegral = expression.includes('acc')
  let acc = 0

  for (let i = 0; i < len; i++) {
    const time = main.timestamps[i]
    const value = main.values[i]

    const scope: Record<string, number> = {
      time,
      value,
      prev_value: i > 0 ? main.values[i - 1] : NaN,
      prev_time: i > 0 ? main.timestamps[i - 1] : NaN,
      next_value: i < len - 1 ? main.values[i + 1] : NaN,
      next_time: i < len - 1 ? main.timestamps[i + 1] : NaN,
      first_value: main.values[0],
      acc,
    }

    // Bind additional series as v1, v2, v3, ...
    for (let j = 0; j < additional.length; j++) {
      const addSeries = additional[j]
      const idx = nearestIndex(addSeries.timestamps, time)
      scope[`v${j + 1}`] = addSeries.values[idx]
    }

    let result: number
    try {
      result = compiled.evaluate(scope) as number
    } catch {
      result = NaN
    }

    // Special case: integral at i=0
    if (isIntegral && i === 0) {
      result = 0
    }

    resultValues[i] = typeof result === 'number' ? result : NaN

    // Feed back result as acc for next iteration
    if (isIntegral) {
      acc = resultValues[i]
    }
  }

  return {
    timestamps: new Float64Array(main.timestamps),
    values: resultValues,
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/CustomFunction/
git commit -m "feat: add function templates and mathjs expression evaluator"
```

---

## Task 3: Custom function store

**Files:**
- Create: `frontend/src/stores/useCustomFunctionStore.ts`
- Modify: `frontend/src/stores/useDataStore.ts`

- [ ] **Step 1: Add setCustomData/removeCustomData to useDataStore**

In `useDataStore.ts`, add two new actions to the store. These allow the custom function store to write/remove data without going through `fetchFields`.

Add to the store interface and implementation:

```typescript
setCustomData: (key: string, data: FieldData) => void
removeCustomData: (key: string) => void
```

Implementation:
```typescript
setCustomData: (key, fieldData) =>
  set((state) => ({
    data: { ...state.data, [key]: fieldData },
  })),

removeCustomData: (key) =>
  set((state) => {
    const { [key]: _, ...rest } = state.data
    return { data: rest }
  }),
```

Also guard `fetchFields` to skip `"custom:"` keys — at the top of `fetchFields`, filter them out:

```typescript
const missing = fields.filter(
  (f) => !state.data[f] && !f.startsWith('custom:')
)
```

- [ ] **Step 2: Create useCustomFunctionStore.ts**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CustomFunctionDef } from '../types'
import { evaluateExpression } from '../components/CustomFunction/evaluateExpression'
import { useDataStore } from './useDataStore'

interface CustomFunctionState {
  functions: Record<string, CustomFunctionDef>
  selectedId: string | null

  addFunction: (def: Omit<CustomFunctionDef, 'id'>) => string
  updateFunction: (id: string, def: Partial<CustomFunctionDef>) => void
  removeFunction: (id: string) => void
  setSelectedId: (id: string | null) => void

  evaluateFunction: (id: string) => void
  evaluateAll: () => void
}

export const useCustomFunctionStore = create<CustomFunctionState>()(
  persist(
    (set, get) => ({
      functions: {},
      selectedId: null,

      addFunction: (def) => {
        const id = crypto.randomUUID()
        const fullDef = { ...def, id }
        set((state) => ({
          functions: { ...state.functions, [id]: fullDef },
        }))
        // Evaluate immediately
        setTimeout(() => get().evaluateFunction(id), 0)
        return id
      },

      updateFunction: (id, partial) => {
        set((state) => {
          const existing = state.functions[id]
          if (!existing) return state
          return {
            functions: {
              ...state.functions,
              [id]: { ...existing, ...partial },
            },
          }
        })
        // Re-evaluate after update
        setTimeout(() => get().evaluateFunction(id), 0)
      },

      removeFunction: (id) => {
        const fn = get().functions[id]
        if (!fn) return
        const dataKey = `custom:${fn.name}`
        useDataStore.getState().removeCustomData(dataKey)
        set((state) => {
          const { [id]: _, ...rest } = state.functions
          return {
            functions: rest,
            selectedId: state.selectedId === id ? null : state.selectedId,
          }
        })
      },

      setSelectedId: (id) => set({ selectedId: id }),

      evaluateFunction: (id) => {
        const fn = get().functions[id]
        if (!fn) return
        const dataStore = useDataStore.getState()
        const main = dataStore.data[fn.mainInput]
        if (!main) return

        const additional = fn.additionalInputs
          .map((key) => dataStore.data[key])
          .filter(Boolean)

        try {
          const result = evaluateExpression({
            expression: fn.expression,
            main,
            additional,
          })
          dataStore.setCustomData(`custom:${fn.name}`, result)
        } catch (e) {
          console.error(`Failed to evaluate custom function "${fn.name}":`, e)
        }
      },

      evaluateAll: () => {
        const fns = get().functions
        for (const id of Object.keys(fns)) {
          get().evaluateFunction(id)
        }
      },
    }),
    {
      name: 'webjuggler-custom-functions',
      partialize: (state) => ({ functions: state.functions }),
    },
  ),
)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/useCustomFunctionStore.ts frontend/src/stores/useDataStore.ts
git commit -m "feat: add custom function store with evaluation engine"
```

---

## Task 4: Guard existing components for `"custom:"` keys

**Files:**
- Modify: `frontend/src/components/PlotArea/PlotPanel.tsx` (drop handler)
- Modify: `frontend/src/components/PlotArea/TimeSeriesPlot.tsx` (seriesLabel)
- Modify: `frontend/src/components/PlotArea/PlotLegend.tsx` (displayName)
- Modify: `frontend/src/components/EditCurvesDialog.tsx` (seriesLabel)
- Modify: `frontend/src/components/AxisConfigDialog.tsx` (fieldLabel)

- [ ] **Step 1: Guard PlotPanel drop handler**

In `PlotPanel.tsx`, modify the drop handler so `fetchFields` skips custom keys:

```typescript
const handleDrop = useCallback(
  (e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/webjuggler-fields')
    if (!raw) return
    try {
      const fields = JSON.parse(raw) as string[]
      addSeries(node.id, fields)
      // Only fetch non-custom fields
      const toFetch = fields.filter((f) => !f.startsWith('custom:'))
      if (toFetch.length > 0) fetchFields(toFetch)
    } catch {
      // ignore
    }
  },
  [addSeries, fetchFields, node.id],
)
```

- [ ] **Step 2: Guard seriesLabel in TimeSeriesPlot.tsx**

At the top of `seriesLabel` function, add:

```typescript
function seriesLabel(compositeField: string): string {
  if (compositeField.startsWith('custom:')) {
    return '[fn] ' + compositeField.substring(7)
  }
  // ... existing code
}
```

- [ ] **Step 3: Guard displayName in PlotLegend.tsx**

Same pattern — add at top of `displayName`:

```typescript
if (compositeField.startsWith('custom:')) {
  return '[fn] ' + compositeField.substring(7)
}
```

- [ ] **Step 4: Guard seriesLabel in EditCurvesDialog.tsx**

At the top of `seriesLabel` function, add the same guard:

```typescript
if (compositeField.startsWith('custom:')) {
  return '[fn] ' + compositeField.substring(7)
}
```

- [ ] **Step 5: Guard fieldLabel in AxisConfigDialog.tsx**

Same pattern at the top of `fieldLabel`:

```typescript
if (compositeField.startsWith('custom:')) {
  return '[fn] ' + compositeField.substring(7)
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/PlotArea/PlotPanel.tsx frontend/src/components/PlotArea/TimeSeriesPlot.tsx frontend/src/components/PlotArea/PlotLegend.tsx frontend/src/components/EditCurvesDialog.tsx frontend/src/components/AxisConfigDialog.tsx
git commit -m "feat: guard existing components for custom series keys"
```

---

## Task 5: Custom Series sidebar section

**Files:**
- Create: `frontend/src/components/Sidebar/CustomSeriesSection.tsx`
- Modify: `frontend/src/components/Sidebar/Sidebar.tsx`

- [ ] **Step 1: Create CustomSeriesSection.tsx**

Component that renders the custom series list with [+][edit][delete] buttons and drag support.

```typescript
import React, { useCallback } from 'react'
import { useCustomFunctionStore } from '../../stores/useCustomFunctionStore'

interface Props {
  onAdd: () => void
  onEdit: (id: string) => void
}

export const CustomSeriesSection: React.FC<Props> = ({ onAdd, onEdit }) => {
  const { functions, selectedId, setSelectedId, removeFunction } =
    useCustomFunctionStore()
  const fnList = Object.values(functions)

  const handleDragStart = useCallback(
    (e: React.DragEvent, name: string) => {
      e.dataTransfer.setData(
        'application/webjuggler-fields',
        JSON.stringify([`custom:${name}`]),
      )
      e.dataTransfer.effectAllowed = 'copy'
    },
    [],
  )

  const handleDelete = useCallback(() => {
    if (selectedId) removeFunction(selectedId)
  }, [selectedId, removeFunction])

  return (
    <div className="custom-series-section">
      <div className="custom-series-header">
        <span>Custom Series:</span>
        <div className="custom-series-buttons">
          <button onClick={onAdd} title="Add custom function">+</button>
          <button
            onClick={() => selectedId && onEdit(selectedId)}
            disabled={!selectedId}
            title="Edit selected"
          >
            ✎
          </button>
          <button
            onClick={handleDelete}
            disabled={!selectedId}
            title="Delete selected"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="custom-series-list">
        {fnList.map((fn) => (
          <div
            key={fn.id}
            className={`custom-series-item ${selectedId === fn.id ? 'selected' : ''}`}
            onClick={() => setSelectedId(fn.id)}
            onDoubleClick={() => onEdit(fn.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, fn.name)}
          >
            {fn.name}
          </div>
        ))}
        {fnList.length === 0 && (
          <div className="custom-series-empty">No custom series</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add CustomSeriesSection to Sidebar.tsx**

Import and render after the file groups, before the closing sidebar div. Add state for controlling the editor modal:

```typescript
import { CustomSeriesSection } from './CustomSeriesSection'
// ... and in the component:
const [editorOpen, setEditorOpen] = useState(false)
const [editingId, setEditingId] = useState<string | null>(null)
```

Render at the bottom of the sidebar:
```tsx
<CustomSeriesSection
  onAdd={() => { setEditingId(null); setEditorOpen(true) }}
  onEdit={(id) => { setEditingId(id); setEditorOpen(true) }}
/>
```

- [ ] **Step 3: Add CSS for custom series section**

Append to `frontend/src/index.css`:

```css
/* ---- Custom Series Section ---- */
.custom-series-section {
  border-top: 1px solid var(--border);
  padding: 8px;
}
.custom-series-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}
.custom-series-buttons {
  display: flex;
  gap: 4px;
}
.custom-series-buttons button {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-primary);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}
.custom-series-buttons button:disabled {
  opacity: 0.4;
  cursor: default;
}
.custom-series-item {
  padding: 2px 8px;
  font-size: 12px;
  cursor: grab;
  border-radius: 3px;
  user-select: none;
  color: var(--text-primary);
}
.custom-series-item:hover {
  background: var(--bg-hover);
}
.custom-series-item.selected {
  background: var(--bg-selected);
  border: 1px solid var(--accent);
}
.custom-series-empty {
  font-size: 11px;
  color: var(--text-secondary);
  padding: 4px 8px;
}
```

- [ ] **Step 4: Verify TypeScript compiles and app renders**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar/CustomSeriesSection.tsx frontend/src/components/Sidebar/Sidebar.tsx
git commit -m "feat: add Custom Series section to sidebar"
```

---

## Task 6: Function library component

**Files:**
- Create: `frontend/src/components/CustomFunction/FunctionLibrary.tsx`

- [ ] **Step 1: Create FunctionLibrary.tsx**

Renders the selectable list of function templates. Clicking a template calls `onSelect` with the template.

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CustomFunction/FunctionLibrary.tsx
git commit -m "feat: add function library list component"
```

---

## Task 7: Custom Function Editor modal

**Files:**
- Create: `frontend/src/components/CustomFunction/CustomFunctionEditor.tsx`
- Modify: `frontend/src/components/Sidebar/Sidebar.tsx` (render the modal)

- [ ] **Step 1: Create CustomFunctionEditor.tsx**

The modal dialog with: name input, main input drop zone, additional inputs drop zone, function library, expression textarea, error display, create/save/cancel buttons.

```typescript
import React, { useState, useCallback, useEffect } from 'react'
import { compile } from 'mathjs/number'
import { useCustomFunctionStore } from '../../stores/useCustomFunctionStore'
import { useDataStore } from '../../stores/useDataStore'
import { FunctionLibrary } from './FunctionLibrary'
import type { FunctionTemplate } from './functionTemplates'
import type { CustomFunctionDef } from '../../types'

interface Props {
  editingId: string | null  // null = create mode
  onClose: () => void
}

export const CustomFunctionEditor: React.FC<Props> = ({ editingId, onClose }) => {
  const { functions, addFunction, updateFunction } = useCustomFunctionStore()
  const fetchFields = useDataStore((s) => s.fetchFields)

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

  // Populate from existing when editingId changes
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
          setMainInput(filtered[0])
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

    // Check duplicate name (exclude self when editing)
    const allFns = Object.values(functions)
    const duplicate = allFns.find(
      (f) => f.name === name && f.id !== editingId,
    )
    if (duplicate) return `Name "${name}" already exists`

    // Try compile
    try {
      compile(expression)
    } catch (e: any) {
      return `Expression error: ${e.message}`
    }
    return null
  }

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
    onClose()
  }, [
    name, expression, mainInput, additionalInputs, selectedLibrary,
    editingId, addFunction, updateFunction, fetchFields, onClose, functions,
  ])

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Custom Function Editor</h3>
          <button onClick={onClose}>x</button>
        </div>
        <div className="dialog-body">

        <label className="fn-editor-label">Name:</label>
        <input
          className="fn-editor-input"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null) }}
          placeholder="my_custom_series"
        />

        <label className="fn-editor-label">
          Input timeseries (→ time, value):
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
          Additional source timeseries (→ v1, v2, v3...):
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
                  <button onClick={() => removeAdditionalInput(i)}>✕</button>
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
          <button onClick={onClose}>Cancel</button>
          <button className="fn-editor-submit" onClick={handleSubmit}>
            {editingId ? 'Save' : 'Create'}
          </button>
        </div>

        </div>{/* dialog-body */}
      </div>{/* dialog */}
    </div>
  )
}
```

- [ ] **Step 2: Add CSS for the editor modal**

Uses existing `.dialog-overlay`, `.dialog`, `.dialog-header`, `.dialog-body` classes from `index.css`.
Only custom styles needed — append to `frontend/src/index.css`:

```css
/* ---- Custom Function Editor ---- */
.fn-editor-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 10px 0 4px;
}
.fn-editor-input {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 13px;
  box-sizing: border-box;
}
.fn-editor-dropzone {
  border: 2px dashed var(--border);
  border-radius: 4px;
  padding: 8px;
  min-height: 32px;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
}
.fn-editor-additional {
  flex-direction: column;
  align-items: stretch;
  min-height: 48px;
  gap: 2px;
}
.fn-additional-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 4px;
  font-size: 12px;
  color: var(--text-primary);
}
.fn-additional-item button {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
}
.function-library-list {
  border: 1px solid var(--border);
  border-radius: 4px;
  max-height: 120px;
  overflow-y: auto;
}
.function-library-item {
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-primary);
}
.function-library-item:hover {
  background: var(--bg-hover);
}
.function-library-item.selected {
  background: var(--bg-selected);
  border-left: 2px solid var(--accent);
}
.fn-editor-textarea {
  width: 100%;
  padding: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: monospace;
  font-size: 13px;
  resize: vertical;
  box-sizing: border-box;
}
.fn-editor-error {
  color: var(--error);
  font-size: 12px;
  margin-top: 6px;
}
.fn-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.fn-editor-actions button {
  padding: 6px 16px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-btn);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
}
.fn-editor-actions button:hover {
  background: var(--bg-btn-hover);
}
.fn-editor-submit {
  background: var(--accent) !important;
  color: var(--bg-primary) !important;
  border: none !important;
}
```

- [ ] **Step 3: Render modal in Sidebar.tsx**

Add the modal rendering, conditionally shown when `editorOpen` is true:

```tsx
import { CustomFunctionEditor } from '../CustomFunction/CustomFunctionEditor'

// ... in the return JSX, after the sidebar div:
{editorOpen && (
  <CustomFunctionEditor
    editingId={editingId}
    onClose={() => setEditorOpen(false)}
  />
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CustomFunction/CustomFunctionEditor.tsx frontend/src/components/Sidebar/Sidebar.tsx
git commit -m "feat: add Custom Function Editor modal"
```

---

## Task 8: Integration — re-evaluate on data fetch & cleanup on file delete

**Files:**
- Modify: `frontend/src/stores/useDataStore.ts`
- Modify: `frontend/src/stores/useCustomFunctionStore.ts`

- [ ] **Step 1: Re-evaluate custom functions when source data is fetched**

In `useDataStore.ts`, after storing fetched field data (inside `fetchFields`), call `evaluateAll` on the custom function store to recompute any custom functions that depend on the newly fetched data:

```typescript
// At end of fetchFields, after setting data:
import { useCustomFunctionStore } from './useCustomFunctionStore'

// After set({ data: { ...state.data, ...mapped } }):
setTimeout(() => useCustomFunctionStore.getState().evaluateAll(), 0)
```

- [ ] **Step 2: Clean up custom series when file is deleted**

In `useDataStore.ts` `clearFileData`, after clearing file data, re-evaluate all custom functions (those depending on deleted data will produce empty/NaN results):

```typescript
// At end of clearFileData:
setTimeout(() => useCustomFunctionStore.getState().evaluateAll(), 0)
```

- [ ] **Step 3: Add `removeSeriesFromAll` to useLayoutStore**

Add a new action that recursively walks the entire layout tree and removes a field from every panel's series array. Add this helper function and action:

```typescript
// Helper: recursively remove a field from all PlotNodes in the tree
function removeFieldFromTree(node: LayoutNode, field: string): LayoutNode {
  if (node.type === 'plot') {
    return { ...node, series: node.series.filter((s) => s !== field) }
  }
  // SplitNode: recurse into children
  return {
    ...node,
    children: node.children.map((c) => removeFieldFromTree(c, field)),
  }
}

// Add to the store actions:
removeSeriesFromAll: (field: string) =>
  set((state) => ({
    ...pushUndo(state),
    root: removeFieldFromTree(state.root, field),
  })),
```

- [ ] **Step 4: Wire removeSeriesFromAll into useCustomFunctionStore.removeFunction**

In `useCustomFunctionStore.ts`, import and call `removeSeriesFromAll` in `removeFunction`:

```typescript
import { useLayoutStore } from './useLayoutStore'

// In removeFunction, after removeCustomData:
useLayoutStore.getState().removeSeriesFromAll(dataKey)
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/useDataStore.ts frontend/src/stores/useCustomFunctionStore.ts frontend/src/stores/useLayoutStore.ts
git commit -m "feat: integrate custom function re-evaluation and cleanup"
```

---

## Task 9: Manual testing

- [ ] **Step 1: Start backend and frontend**

```bash
cd backend && JAVA_HOME=/home/kmk/.local/jdk/jdk-21.0.10 ./gradlew bootRun &
cd frontend && npm run dev
```

- [ ] **Step 2: Test basic flow**

1. Upload a .ulg file
2. Click [+] in Custom Series section
3. Set name: `roll_deg`
4. Drag `vehicle_attitude/q.00` to main input
5. Select `rad_to_deg` from library
6. Expression auto-fills: `value * 180 / pi`
7. Click Create
8. Verify `roll_deg` appears in Custom Series list
9. Drag `roll_deg` to a plot panel
10. Verify it renders as a time series

- [ ] **Step 3: Test multi-input function**

1. Click [+]
2. Name: `my_pitch`
3. Drag `vehicle_attitude/q.00` to main input (w)
4. Drag `q.01`, `q.02`, `q.03` to additional inputs (v1, v2, v3)
5. Select `quat_to_pitch` from library
6. Click Create
7. Drag to plot, verify pitch curve

- [ ] **Step 4: Test edit and delete**

1. Select `roll_deg` in Custom Series list
2. Click edit button, change expression to `value * 180 / 3.14159`
3. Save — verify plot updates
4. Click delete — verify series removed from list and plot

- [ ] **Step 5: Test custom expression**

1. Click [+]
2. Name: `custom_expr`
3. Drag any field to main input
4. Type expression: `value * 2 + 1`
5. Create and verify in plot

- [ ] **Step 6: Test persistence**

1. Create a custom function
2. Refresh the page
3. Verify custom function definition persists in sidebar
4. Drag to plot, verify it re-evaluates when data is fetched

- [ ] **Step 7: Test error handling**

1. Click [+], leave name empty → error
2. Enter invalid expression `***invalid` → error on Create
3. Enter duplicate name → error

- [ ] **Step 8: Commit any fixes**

```bash
git add -u
git commit -m "fix: custom function edge cases from manual testing"
```

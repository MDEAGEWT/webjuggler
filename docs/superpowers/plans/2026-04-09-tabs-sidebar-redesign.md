# Tabbed Plot Area & Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tabbed plot area (PlotJuggler-style), split sidebar into two scroll zones, and convert Custom Function Editor from modal to tab.

**Architecture:** Refactor useLayoutStore from single `root` to `tabs[]` + `activeTabId`. Each tab owns its own split tree and undo/redo stacks. Add TabBar component above the plot area. Convert modal editor into a tab-rendered editor. Sidebar gets two independent scroll zones.

**Tech Stack:** React 18, TypeScript, Zustand (persist middleware), react-resizable-panels

**Spec:** `docs/superpowers/specs/2026-04-09-tabs-sidebar-redesign.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/stores/useLayoutStore.ts` | `root` → `tabs[]` + `activeTabId`, per-tab undo, tab actions, `selectActiveRoot`, localStorage migration |
| Modify | `frontend/src/stores/useCustomFunctionStore.ts` | Add `closeEditorTabForFunction` call in `removeFunction` |
| Create | `frontend/src/components/TabBar.tsx` | Tab bar UI (click, rename, close, add) |
| Create | `frontend/src/components/CustomFunction/CustomFunctionEditorTab.tsx` | Tab version of editor (no modal wrapper) |
| Delete | `frontend/src/components/CustomFunction/CustomFunctionEditor.tsx` | Modal version replaced by tab |
| Modify | `frontend/src/App.tsx` | Render TabBar + tab content, use `selectActiveRoot` |
| Modify | `frontend/src/components/Sidebar/Sidebar.tsx` | Two scroll zones, remove modal state, route to tab |
| Modify | `frontend/src/components/Sidebar/CustomSeriesSection.tsx` | Call `addTab` instead of opening modal |
| Modify | `frontend/src/components/PlotArea/TimeSeriesPlot.tsx` | `s.root` → `selectActiveRoot` |
| Modify | `frontend/src/components/PlotArea/XYPlot.tsx` | `s.root` → `selectActiveRoot` |
| Modify | `frontend/src/components/PlotArea/ThreeDPlot.tsx` | `s.root` → `selectActiveRoot` |
| Modify | `frontend/src/components/EditCurvesDialog.tsx` | `s.root` → `selectActiveRoot` |
| Modify | `frontend/src/components/AxisConfigDialog.tsx` | `s.root` → `selectActiveRoot` |
| Modify | `frontend/src/index.css` | Sidebar split CSS, tab bar CSS, remove modal CSS |

---

## Task 1: Refactor useLayoutStore — tabs + selectActiveRoot

This is the foundational change. Everything else depends on it.

**Files:**
- Modify: `frontend/src/stores/useLayoutStore.ts`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add TabDef type to types/index.ts**

```typescript
export interface TabDef {
  id: string
  name: string
  type: 'plot' | 'editor'
  root: LayoutNode
  undoStack: LayoutNode[]
  redoStack: LayoutNode[]
  editingFunctionId?: string
}
```

- [ ] **Step 2: Refactor useLayoutStore state**

Replace the `root`, `undoStack`, `redoStack` top-level fields with `tabs` and `activeTabId`. Key changes:

**Interface:**
```typescript
interface LayoutState {
  tabs: TabDef[]
  activeTabId: string
  focusedPanelId: string | null
  colorOverrides: Record<string, string>
  // all existing actions stay, plus new tab actions
  addTab: (type: 'plot' | 'editor', editingFunctionId?: string | null) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  renameTab: (tabId: string, name: string) => void
  closeEditorTabForFunction: (functionId: string) => void
  // ... existing actions unchanged in signature
}
```

**Helper — get/update active tab root:**
```typescript
function getActiveTab(state: LayoutState): TabDef {
  return state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0]
}

function updateActiveTabRoot(
  state: LayoutState,
  updater: (root: LayoutNode) => LayoutNode,
): Partial<LayoutState> {
  const tab = getActiveTab(state)
  return {
    tabs: state.tabs.map((t) =>
      t.id === tab.id
        ? {
            ...t,
            undoStack: [...t.undoStack.slice(-50), t.root],
            redoStack: [],
            root: updater(t.root),
          }
        : t,
    ),
  }
}
```

**Selector export:**
```typescript
export function selectActiveRoot(state: LayoutState): LayoutNode {
  const tab = state.tabs.find((t) => t.id === state.activeTabId)
  return tab?.root ?? makePlotNode()
}
```

- [ ] **Step 3: Update all existing actions to use updateActiveTabRoot**

Every action that currently does `set((state) => ({ ...pushUndo(state), root: ... }))` needs to become `set((state) => updateActiveTabRoot(state, (root) => ...))`.

Key actions to update: `splitPanel`, `closePanel`, `addSeries`, `removeSeries`, `clearSeries`, `setPlotMode`, `setDisplayMode`, `toggleAxisNegate`, `setLineStyle`, `setLineWidth`, `setAxisMapping`.

**undo/redo** — now per-tab:
```typescript
undo: () =>
  set((state) => {
    const tab = getActiveTab(state)
    if (tab.undoStack.length === 0) return state
    const prev = tab.undoStack[tab.undoStack.length - 1]
    return {
      tabs: state.tabs.map((t) =>
        t.id === tab.id
          ? {
              ...t,
              undoStack: t.undoStack.slice(0, -1),
              redoStack: [...t.redoStack, t.root],
              root: prev,
            }
          : t,
      ),
    }
  }),
```

- [ ] **Step 4: Update cross-tab actions**

`removeSeriesFromAll` and `renameSeriesInAll` must iterate ALL tabs:

```typescript
removeSeriesFromAll: (field) =>
  set((state) => ({
    tabs: state.tabs.map((t) => ({
      ...t,
      root: removeFieldFromTree(t.root, field),
    })),
  })),

renameSeriesInAll: (oldField, newField) =>
  set((state) => ({
    tabs: state.tabs.map((t) => ({
      ...t,
      root: renameFieldInTree(t.root, oldField, newField),
    })),
    colorOverrides: Object.fromEntries(
      Object.entries(state.colorOverrides).map(([k, v]) =>
        [k === oldField ? newField : k, v],
      ),
    ),
  })),
```

- [ ] **Step 5: Add new tab actions**

```typescript
addTab: (type, editingFunctionId) => {
  const id = `tab-${Date.now()}`
  // Find next unused tab number for plot tabs
  const existingNums = get().tabs
    .map((t) => t.name.match(/^Tab (\d+)$/)?.[1])
    .filter(Boolean)
    .map(Number)
  const nextNum = existingNums.length === 0 ? 1 : Math.max(...existingNums) + 1
  const name = type === 'editor'
    ? editingFunctionId
      ? `fn: ${Object.values(get().functions ?? {}).find(...)?.name ?? 'edit'}`
      // Actually, editor tab name comes from custom function store
      : 'New Function'
    : `Tab ${nextNum}`
  // ... (full implementation in code)
},
```

Actually, the editor tab name needs the function name from `useCustomFunctionStore`. Simpler approach — accept a `name` parameter:

```typescript
addTab: (type, editingFunctionId, name?) => {
  // For plot tabs, auto-generate name if not provided
  // For editor tabs, use provided name or "New Function"
}
```

- [ ] **Step 6: Update setActiveTab to reset focusedPanelId**

```typescript
setActiveTab: (tabId) =>
  set({ activeTabId: tabId, focusedPanelId: null }),
```

- [ ] **Step 7: Add closeEditorTabForFunction**

```typescript
closeEditorTabForFunction: (functionId) =>
  set((state) => {
    const editorTab = state.tabs.find(
      (t) => t.type === 'editor' && t.editingFunctionId === functionId,
    )
    if (!editorTab) return state
    const remaining = state.tabs.filter((t) => t.id !== editorTab.id)
    return {
      tabs: remaining,
      activeTabId: state.activeTabId === editorTab.id
        ? remaining[remaining.length - 1].id
        : state.activeTabId,
    }
  }),
```

- [ ] **Step 8: Update persist — partialize and migration**

```typescript
persist(
  (set, get) => ({ ... }),
  {
    name: 'webjuggler-layout',
    partialize: (state) => ({
      tabs: state.tabs
        .filter((t) => t.type === 'plot')  // don't persist editor tabs
        .map((t) => ({
          ...t,
          undoStack: [],
          redoStack: [],
        })),
      activeTabId: state.activeTabId,
      colorOverrides: state.colorOverrides,
    }),
    // Migration: old root → tabs
    migrate: (persisted: any) => {
      if (persisted && 'root' in persisted && !('tabs' in persisted)) {
        return {
          tabs: [{
            id: 'tab-1',
            name: 'Tab 1',
            type: 'plot' as const,
            root: persisted.root,
            undoStack: [],
            redoStack: [],
          }],
          activeTabId: 'tab-1',
          colorOverrides: persisted.colorOverrides ?? {},
        }
      }
      return persisted
    },
    version: 1,
    onRehydrateStorage: () => (state) => {
      if (state?.tabs) {
        let maxId = 0
        for (const tab of state.tabs) {
          maxId = Math.max(maxId, maxPlotId(tab.root))
        }
        nextId = maxId + 1
      }
    },
  },
),
```

- [ ] **Step 9: Initial state**

```typescript
const defaultTab: TabDef = {
  id: 'tab-1',
  name: 'Tab 1',
  type: 'plot',
  root: makePlotNode(),
  undoStack: [],
  redoStack: [],
}

// Initial store state:
tabs: [defaultTab],
activeTabId: 'tab-1',
focusedPanelId: null,
colorOverrides: {},
```

- [ ] **Step 10: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

This WILL have errors because consumers still reference `s.root`. That's expected — they'll be fixed in Task 3.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/stores/useLayoutStore.ts frontend/src/types/index.ts
git commit -m "feat: refactor useLayoutStore to tab-based architecture"
```

---

## Task 2: TabBar component

**Files:**
- Create: `frontend/src/components/TabBar.tsx`

- [ ] **Step 1: Create TabBar.tsx**

```typescript
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

  const plotTabCount = tabs.filter((t) => t.type === 'plot').length

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
          {!(tab.type === 'plot' && plotTabCount <= 1) && (
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
            >
              &times;
            </span>
          )}
        </div>
      ))}
      <div className="tab-add" onClick={() => addTab('plot')}>
        +
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
git add frontend/src/components/TabBar.tsx
git commit -m "feat: add TabBar component"
```

---

## Task 3: Update App.tsx and all s.root consumers

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/PlotArea/TimeSeriesPlot.tsx`
- Modify: `frontend/src/components/PlotArea/XYPlot.tsx`
- Modify: `frontend/src/components/PlotArea/ThreeDPlot.tsx`
- Modify: `frontend/src/components/EditCurvesDialog.tsx`
- Modify: `frontend/src/components/AxisConfigDialog.tsx`

- [ ] **Step 1: Update App.tsx**

Replace the plot-area rendering to include TabBar and conditional tab content:

```tsx
import TabBar from './components/TabBar'
import { selectActiveRoot } from './stores/useLayoutStore'
import { CustomFunctionEditorTab } from './components/CustomFunction/CustomFunctionEditorTab'

// In the component:
const root = useLayoutStore(selectActiveRoot)
const activeTab = useLayoutStore((s) =>
  s.tabs.find((t) => t.id === s.activeTabId)
)

// Replace the plot-area div:
<div className="plot-area">
  <TabBar />
  <div className="tab-content">
    {activeTab?.type === 'editor' ? (
      <CustomFunctionEditorTab
        editingId={activeTab.editingFunctionId ?? null}
        tabId={activeTab.id}
      />
    ) : (
      <SplitLayout node={root} />
    )}
  </div>
</div>
```

Note: `CustomFunctionEditorTab` doesn't exist yet (Task 5). For now, add the import but comment out the editor branch, or create an empty placeholder. The placeholder approach is simpler:

```tsx
{activeTab?.type === 'editor' ? (
  <div style={{ padding: 20, color: 'var(--text-primary)' }}>
    Editor tab placeholder (Task 5)
  </div>
) : (
  <SplitLayout node={root} />
)}
```

Also update keyboard handler: the current `useLayoutStore((s) => s.root)` reference needs to become `useLayoutStore(selectActiveRoot)`.

- [ ] **Step 2: Update all s.root references in plot components**

In each of these files, find `useLayoutStore((s) => s.root)` and replace with `useLayoutStore(selectActiveRoot)`. Import `selectActiveRoot` from the store.

Files:
- `TimeSeriesPlot.tsx` — search for `s.root`
- `XYPlot.tsx` — search for `s.root`
- `ThreeDPlot.tsx` — search for `s.root`
- `EditCurvesDialog.tsx` — search for `s.root`
- `AxisConfigDialog.tsx` — search for `s.root`

Pattern in each file:
```typescript
// Before:
import { useLayoutStore } from '../../stores/useLayoutStore'
const something = useLayoutStore((s) => { /* uses s.root */ })

// After:
import { useLayoutStore, selectActiveRoot } from '../../stores/useLayoutStore'
const root = useLayoutStore(selectActiveRoot)
// Then use root instead of s.root
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/PlotArea/TimeSeriesPlot.tsx frontend/src/components/PlotArea/XYPlot.tsx frontend/src/components/PlotArea/ThreeDPlot.tsx frontend/src/components/EditCurvesDialog.tsx frontend/src/components/AxisConfigDialog.tsx
git commit -m "feat: integrate TabBar in App and migrate s.root to selectActiveRoot"
```

---

## Task 4: Sidebar split layout

**Files:**
- Modify: `frontend/src/components/Sidebar/Sidebar.tsx`
- Modify: `frontend/src/components/Sidebar/CustomSeriesSection.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Restructure Sidebar.tsx**

Remove `editorOpen`/`editingId` state and modal rendering. Split into two zones. Route [+]/[edit] to tab system:

```typescript
import { useLayoutStore } from '../../stores/useLayoutStore'
import { useCustomFunctionStore } from '../../stores/useCustomFunctionStore'

// Remove: editorOpen, editingId state
// Remove: CustomFunctionEditor import and rendering

// Add:
const addTab = useLayoutStore((s) => s.addTab)
const functions = useCustomFunctionStore((s) => s.functions)

// Change CustomSeriesSection callbacks:
<CustomSeriesSection
  onAdd={() => addTab('editor', null, 'New Function')}
  onEdit={(id) => {
    const fn = functions[id]
    addTab('editor', id, fn ? `fn: ${fn.name}` : 'Edit Function')
  }}
/>
```

Wrap content in two zones:
```tsx
<div className="sidebar">
  <div className="sidebar-header">...</div>
  <input className="sidebar-filter" ... />
  <div className="sidebar-topics-zone">
    {/* file groups / topic tree here */}
  </div>
  <div className="sidebar-custom-zone">
    <CustomSeriesSection ... />
  </div>
</div>
```

- [ ] **Step 2: Update CustomSeriesSection callbacks**

The component currently receives `onAdd` and `onEdit` props. No interface change needed — the callbacks just do different things now (open tab instead of modal).

However, we need to check for existing editor tab before opening a new one (dedup). Add this logic to Sidebar's onEdit:

```typescript
onEdit={(id) => {
  // Check if editor tab already exists for this function
  const existingTab = useLayoutStore.getState().tabs.find(
    (t) => t.type === 'editor' && t.editingFunctionId === id
  )
  if (existingTab) {
    useLayoutStore.getState().setActiveTab(existingTab.id)
  } else {
    const fn = functions[id]
    addTab('editor', id, fn ? `fn: ${fn.name}` : 'Edit Function')
  }
}}
```

- [ ] **Step 3: Add sidebar CSS to index.css**

Append to `frontend/src/index.css`:

```css
/* ---- Sidebar Split Zones ---- */
.sidebar-topics-zone {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.sidebar-custom-zone {
  height: 120px;
  flex-shrink: 0;
  overflow-y: auto;
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 4: Add tab bar CSS to index.css**

```css
/* ---- Tab Bar ---- */
.tab-bar {
  display: flex;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border);
  padding: 0 4px;
  flex-shrink: 0;
  overflow-x: auto;
}
.tab {
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  border: 1px solid transparent;
  border-bottom: none;
  margin-top: 2px;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tab.active {
  color: var(--text-primary);
  background: var(--bg-secondary);
  border-color: var(--border);
  border-radius: 4px 4px 0 0;
}
.tab-close {
  font-size: 10px;
  color: var(--text-muted);
  cursor: pointer;
}
.tab-close:hover {
  color: var(--text-primary);
}
.tab-add {
  padding: 4px 8px;
  color: var(--text-muted);
  cursor: pointer;
  margin-left: auto;
  font-size: 14px;
}
.tab-add:hover {
  color: var(--text-primary);
}
.tab-rename-input {
  background: var(--bg-input);
  border: 1px solid var(--accent);
  border-radius: 2px;
  color: var(--text-primary);
  font-size: 12px;
  padding: 0 4px;
  width: 80px;
}
.tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
}
```

Also update `.plot-area` to be a flex column:
```css
.plot-area {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;  /* ADD THIS */
  height: 100%;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Sidebar/Sidebar.tsx frontend/src/components/Sidebar/CustomSeriesSection.tsx frontend/src/index.css
git commit -m "feat: split sidebar into two zones and add tab bar CSS"
```

---

## Task 5: CustomFunctionEditorTab

**Files:**
- Create: `frontend/src/components/CustomFunction/CustomFunctionEditorTab.tsx`
- Delete: `frontend/src/components/CustomFunction/CustomFunctionEditor.tsx`
- Modify: `frontend/src/App.tsx` (replace placeholder)

- [ ] **Step 1: Create CustomFunctionEditorTab.tsx**

Copy the logic from `CustomFunctionEditor.tsx` but remove the modal wrapper (`dialog-overlay`, `dialog`, `dialog-header`). Render as a full-panel component. Replace `onClose` with tab close:

```typescript
import React, { useState, useCallback, useEffect } from 'react'
import { compile } from 'mathjs/number'
import { useCustomFunctionStore } from '../../stores/useCustomFunctionStore'
import { useDataStore } from '../../stores/useDataStore'
import { useLayoutStore } from '../../stores/useLayoutStore'
import { FunctionLibrary } from './FunctionLibrary'
import type { FunctionTemplate } from './functionTemplates'

interface Props {
  editingId: string | null
  tabId: string
}

export const CustomFunctionEditorTab: React.FC<Props> = ({ editingId, tabId }) => {
  const { functions, addFunction, updateFunction } = useCustomFunctionStore()
  const fetchFields = useDataStore((s) => s.fetchFields)
  const closeTab = useLayoutStore((s) => s.closeTab)
  const renameTab = useLayoutStore((s) => s.renameTab)

  const existing = editingId ? functions[editingId] : null

  // Same state as modal version
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

  // handleDrop, handleDragOver, handleLibrarySelect, removeAdditionalInput,
  // formatFieldLabel, validate — ALL identical to modal version

  const handleDrop = useCallback(
    (e: React.DragEvent, target: 'main' | 'additional') => {
      e.preventDefault()
      e.stopPropagation()
      const raw = e.dataTransfer.getData('application/webjuggler-fields')
      if (!raw) return
      try {
        const fields = JSON.parse(raw) as string[]
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
    const duplicate = allFns.find((f) => f.name === name && f.id !== editingId)
    if (duplicate) return `Name "${name}" already exists`
    try {
      compile(expression)
    } catch (e: any) {
      return `Expression error: ${e.message}`
    }
    return null
  }

  const handleSubmit = useCallback(async () => {
    const err = validate()
    if (err) { setError(err); return }

    const def = {
      name,
      expression,
      mainInput,
      additionalInputs,
      libraryFunction: selectedLibrary ?? undefined,
    }

    const toFetch = [mainInput, ...additionalInputs].filter(
      (f) => !f.startsWith('custom:'),
    )
    if (toFetch.length > 0) await fetchFields(toFetch)

    if (editingId) {
      updateFunction(editingId, def)
    } else {
      addFunction(def)
    }
    // Update tab name
    renameTab(tabId, `fn: ${name}`)
  }, [name, expression, mainInput, additionalInputs, selectedLibrary,
      editingId, addFunction, updateFunction, fetchFields, renameTab, tabId, functions])

  const handleCancel = useCallback(() => {
    closeTab(tabId)
  }, [closeTab, tabId])

  // Render — same fields as modal but NO overlay/dialog wrapper
  return (
    <div className="fn-editor-tab">
      <div className="fn-editor-tab-content">
        <h3 style={{ color: 'var(--text-primary)', margin: '0 0 12px' }}>
          Custom Function Editor
        </h3>

        <label className="fn-editor-label">Name:</label>
        <input
          className="fn-editor-input"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null) }}
          placeholder="my_custom_series"
        />

        <label className="fn-editor-label">Input timeseries (time, value):</label>
        <div className="fn-editor-dropzone" onDrop={(e) => handleDrop(e, 'main')} onDragOver={handleDragOver}>
          {mainInput ? formatFieldLabel(mainInput) : 'drag & drop here'}
        </div>

        <label className="fn-editor-label">Additional source timeseries (v1, v2, v3...):</label>
        <div className="fn-editor-dropzone fn-editor-additional" onDrop={(e) => handleDrop(e, 'additional')} onDragOver={handleDragOver}>
          {additionalInputs.length === 0
            ? 'drag & drop additional series here'
            : additionalInputs.map((inp, i) => (
                <div key={i} className="fn-additional-item">
                  <span>v{i + 1}: {formatFieldLabel(inp)}</span>
                  <button onClick={() => removeAdditionalInput(i)}>&times;</button>
                </div>
              ))}
        </div>

        <FunctionLibrary selected={selectedLibrary} onSelect={handleLibrarySelect} />

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
```

- [ ] **Step 2: Add CSS for editor tab**

Append to `frontend/src/index.css`:

```css
/* ---- Custom Function Editor Tab ---- */
.fn-editor-tab {
  flex: 1;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: 20px;
}
.fn-editor-tab-content {
  width: 100%;
  max-width: 520px;
}
```

- [ ] **Step 3: Update App.tsx — replace placeholder with real component**

Replace the placeholder `<div>` with the actual `CustomFunctionEditorTab` import and rendering.

- [ ] **Step 4: Delete the modal version**

```bash
rm frontend/src/components/CustomFunction/CustomFunctionEditor.tsx
```

- [ ] **Step 5: Remove any stale imports of CustomFunctionEditor**

Check Sidebar.tsx — the import should already have been removed in Task 4.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/CustomFunction/CustomFunctionEditorTab.tsx frontend/src/App.tsx frontend/src/index.css
git rm frontend/src/components/CustomFunction/CustomFunctionEditor.tsx
git commit -m "feat: convert Custom Function Editor from modal to tab"
```

---

## Task 6: Wire useCustomFunctionStore → closeEditorTabForFunction

**Files:**
- Modify: `frontend/src/stores/useCustomFunctionStore.ts`

- [ ] **Step 1: Add closeEditorTabForFunction call in removeFunction**

In `removeFunction`, after the existing `removeSeriesFromAll` call, add:

```typescript
useLayoutStore.getState().closeEditorTabForFunction(id)
```

This ensures that when a custom function is deleted via the sidebar, any open editor tab for that function is also closed.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/useCustomFunctionStore.ts
git commit -m "feat: close editor tab when custom function is deleted"
```

---

## Task 7: Cleanup and manual testing

- [ ] **Step 1: Remove unused modal CSS**

In `index.css`, the `.fn-editor-overlay` / `.fn-editor-modal` related classes can be removed if they exist. The `.dialog-overlay` / `.dialog` classes are shared and must stay (used by EditCurvesDialog, AxisConfigDialog).

- [ ] **Step 2: Start backend and frontend**

```bash
cd backend && JAVA_HOME=/home/kmk/.local/jdk/jdk-21.0.10 ./gradlew bootRun &
cd frontend && npm run dev
```

- [ ] **Step 3: Test tab system**

1. App starts with "Tab 1" — verify tab bar shows
2. Click [+] → "Tab 2" appears
3. Drop fields in Tab 1, switch to Tab 2 — verify Tab 2 is empty
4. Drop fields in Tab 2 — each tab has independent plots
5. Double-click tab name → inline edit → Enter to confirm
6. Close Tab 2 → verify Tab 1 remains
7. Try close last plot tab → should be blocked

- [ ] **Step 4: Test editor tab**

1. Upload a .ulg file
2. Click [+] in Custom Series → "New Function" tab opens
3. Drag field from sidebar to input drop zone → should work (no modal blocking!)
4. Select `rad_to_deg`, set name, Create → tab name updates to "fn: {name}"
5. Tab stays open after Create
6. Close tab manually with [x]

- [ ] **Step 5: Test sidebar split**

1. Expand many topics → TopicTree scrolls independently
2. Custom Series section stays fixed at bottom
3. Add many custom functions → Custom Series section scrolls independently

- [ ] **Step 6: Test editor dedup**

1. Open editor for "my_pitch"
2. Click edit on "my_pitch" again → should focus existing tab, not create new
3. Delete "my_pitch" from sidebar → editor tab auto-closes

- [ ] **Step 7: Test undo/redo per tab**

1. Tab 1: split panel → Ctrl+Z → should undo
2. Switch to Tab 2 → Ctrl+Z → should be independent

- [ ] **Step 8: Test localStorage persistence**

1. Create Tab 2 with some plots
2. Refresh page
3. Both tabs should restore

- [ ] **Step 9: Commit any fixes**

```bash
git add -u
git commit -m "fix: tabs and sidebar edge cases from manual testing"
```

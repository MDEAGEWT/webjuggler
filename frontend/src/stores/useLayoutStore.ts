import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LayoutNode, PlotNode, TabDef } from '../types'
import { nextGlobalColor } from '../constants'

let nextId = 1
function makePlotNode(): PlotNode {
  return { type: 'plot', id: `plot-${nextId++}`, series: [], plotMode: 'timeseries' }
}

/** Walk the layout tree and find the max numeric plot ID so new IDs don't collide */
function maxPlotId(node: LayoutNode): number {
  if (node.type === 'plot') {
    const match = node.id.match(/^plot-(\d+)$/)
    return match ? parseInt(match[1]!, 10) : 0
  }
  return Math.max(maxPlotId(node.children[0]), maxPlotId(node.children[1]))
}

function findAndReplace(
  node: LayoutNode,
  targetId: string,
  replacer: (node: PlotNode) => LayoutNode,
): LayoutNode {
  if (node.type === 'plot') {
    return node.id === targetId ? replacer(node) : node
  }
  return {
    ...node,
    children: [
      findAndReplace(node.children[0], targetId, replacer),
      findAndReplace(node.children[1], targetId, replacer),
    ],
  }
}

function findAndUpdate(
  node: LayoutNode,
  targetId: string,
  updater: (node: PlotNode) => PlotNode,
): LayoutNode {
  if (node.type === 'plot') {
    return node.id === targetId ? updater(node) : node
  }
  return {
    ...node,
    children: [
      findAndUpdate(node.children[0], targetId, updater),
      findAndUpdate(node.children[1], targetId, updater),
    ],
  }
}

function removePlot(node: LayoutNode, targetId: string): LayoutNode | null {
  if (node.type === 'plot') {
    return node.id === targetId ? null : node
  }
  const left = removePlot(node.children[0], targetId)
  const right = removePlot(node.children[1], targetId)
  if (!left) return right
  if (!right) return left
  return { ...node, children: [left, right] }
}

function removeFieldFromTree(node: LayoutNode, field: string): LayoutNode {
  if (node.type === 'plot') {
    return { ...node, series: node.series.filter((s) => s !== field) }
  }
  return {
    ...node,
    children: [
      removeFieldFromTree(node.children[0], field),
      removeFieldFromTree(node.children[1], field),
    ],
  }
}

function renameFieldInTree(node: LayoutNode, oldField: string, newField: string): LayoutNode {
  if (node.type === 'plot') {
    return { ...node, series: node.series.map((s) => s === oldField ? newField : s) }
  }
  return {
    ...node,
    children: [
      renameFieldInTree(node.children[0], oldField, newField),
      renameFieldInTree(node.children[1], oldField, newField),
    ],
  }
}

function getActiveTab(state: { tabs: TabDef[]; activeTabId: string }): TabDef {
  return state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0]!
}

/** Update active tab's root with undo push */
function updateActiveTabRoot(
  tabs: TabDef[],
  activeTabId: string,
  updater: (root: LayoutNode) => LayoutNode,
): TabDef[] {
  return tabs.map((t) =>
    t.id === activeTabId
      ? {
          ...t,
          undoStack: [...t.undoStack.slice(-50), t.root],
          redoStack: [],
          root: updater(t.root),
        }
      : t,
  )
}

interface LayoutState {
  tabs: TabDef[]
  activeTabId: string
  focusedPanelId: string | null
  colorOverrides: Record<string, string>
  setFocusedPanel: (id: string) => void
  splitPanel: (id: string, direction: 'vertical' | 'horizontal') => void
  closePanel: (id: string) => void
  addSeries: (id: string, fields: string[]) => void
  removeSeries: (id: string, field: string) => void
  clearSeries: (id: string) => void
  setPlotMode: (id: string, mode: 'timeseries' | 'xy' | '3d' | 'attitude') => void
  setDisplayMode: (id: string, mode: 'graph' | 'compass') => void
  setColorOverride: (field: string, color: string) => void
  toggleAxisNegate: (id: string, axisIndex: number) => void
  setLineStyle: (id: string, style: 'lines' | 'dots' | 'lines-dots') => void
  setLineWidth: (id: string, width: number) => void
  setAxisMapping: (id: string, mapping: [number, number, number]) => void
  removeSeriesFromAll: (field: string) => void
  renameSeriesInAll: (oldField: string, newField: string) => void
  undo: () => void
  redo: () => void
  addTab: (type: 'plot' | 'editor', editingFunctionId?: string | null, name?: string) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  renameTab: (tabId: string, name: string) => void
  closeEditorTabForFunction: (functionId: string) => void
}

export function selectActiveRoot(state: LayoutState): LayoutNode {
  const tab = state.tabs.find((t) => t.id === state.activeTabId)
  return tab?.root ?? makePlotNode()
}

const defaultTab: TabDef = {
  id: 'tab-1',
  name: 'Tab 1',
  type: 'plot',
  root: makePlotNode(),
  undoStack: [],
  redoStack: [],
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      tabs: [defaultTab],
      activeTabId: 'tab-1',
      focusedPanelId: null,
      colorOverrides: {},

      setFocusedPanel: (id) => set({ focusedPanelId: id }),

      splitPanel: (id, direction) =>
        set((state) => ({
          tabs: updateActiveTabRoot(state.tabs, state.activeTabId, (root) =>
            findAndReplace(root, id, (existing) => ({
              type: 'split',
              direction,
              children: [
                { ...existing },
                makePlotNode(),
              ],
            })),
          ),
        })),

      closePanel: (id) =>
        set((state) => ({
          tabs: updateActiveTabRoot(state.tabs, state.activeTabId, (root) => {
            const result = removePlot(root, id)
            return result ?? makePlotNode()
          }),
        })),

      addSeries: (id, fields) =>
        set((state) => {
          const newColorOverrides = { ...state.colorOverrides }
          for (const f of fields) {
            if (!newColorOverrides[f]) {
              newColorOverrides[f] = nextGlobalColor()
            }
          }
          return {
            colorOverrides: newColorOverrides,
            tabs: updateActiveTabRoot(state.tabs, state.activeTabId, (root) =>
              findAndUpdate(root, id, (node) => {
                const newSeries = [...new Set([...node.series, ...fields])]
                let plotMode = node.plotMode
                if (node.series.length === 0 && fields.length === 4) {
                  plotMode = 'attitude'
                } else if (node.series.length === 0 && fields.length === 2) {
                  plotMode = 'xy'
                } else if (node.series.length === 0 && fields.length >= 3) {
                  plotMode = '3d'
                } else if (node.series.length === 0 && fields.length === 1) {
                  plotMode = 'timeseries'
                }
                return { ...node, series: newSeries, plotMode }
              }),
            ),
          }
        }),

      removeSeries: (id, field) =>
        set((state) => ({
          tabs: updateActiveTabRoot(state.tabs, state.activeTabId, (root) =>
            findAndUpdate(root, id, (node) => ({
              ...node,
              series: node.series.filter((s) => s !== field),
            })),
          ),
        })),

      clearSeries: (id) =>
        set((state) => ({
          tabs: updateActiveTabRoot(state.tabs, state.activeTabId, (root) =>
            findAndUpdate(root, id, (node) => ({
              ...node,
              series: [],
              plotMode: 'timeseries',
            })),
          ),
        })),

      removeSeriesFromAll: (field) =>
        set((state) => ({
          tabs: state.tabs.map((t) => ({ ...t, root: removeFieldFromTree(t.root, field) })),
        })),

      renameSeriesInAll: (oldField, newField) =>
        set((state) => ({
          tabs: state.tabs.map((t) => ({
            ...t,
            root: renameFieldInTree(t.root, oldField, newField),
          })),
          colorOverrides: Object.fromEntries(
            Object.entries(state.colorOverrides).map(([k, v]) =>
              [k === oldField ? newField : k, v]
            ),
          ),
        })),

      setPlotMode: (id, mode) =>
        set((state) => ({
          tabs: updateActiveTabRoot(state.tabs, state.activeTabId, (root) =>
            findAndUpdate(root, id, (node) => ({
              ...node,
              plotMode: mode,
            })),
          ),
        })),

      setDisplayMode: (id, mode) =>
        set((state) => ({
          tabs: updateActiveTabRoot(state.tabs, state.activeTabId, (root) =>
            findAndUpdate(root, id, (node) => ({
              ...node,
              displayMode: mode,
            })),
          ),
        })),

      setColorOverride: (field, color) =>
        set((state) => ({
          colorOverrides: { ...state.colorOverrides, [field]: color },
        })),

      toggleAxisNegate: (id, axisIndex) =>
        set((state) => ({
          tabs: updateActiveTabRoot(state.tabs, state.activeTabId, (root) =>
            findAndReplace(root, id, (plot) => {
              const neg = [...(plot.axisNegate ?? [false, false, false])]
              neg[axisIndex] = !neg[axisIndex]
              return { ...plot, axisNegate: neg }
            }),
          ),
        })),

      setLineStyle: (id, style) =>
        set((state) => ({
          tabs: updateActiveTabRoot(state.tabs, state.activeTabId, (root) =>
            findAndUpdate(root, id, (node) => ({
              ...node,
              lineStyle: style,
            })),
          ),
        })),

      setLineWidth: (id, width) =>
        set((state) => ({
          tabs: updateActiveTabRoot(state.tabs, state.activeTabId, (root) =>
            findAndUpdate(root, id, (node) => ({
              ...node,
              lineWidth: width,
            })),
          ),
        })),

      setAxisMapping: (id, mapping) =>
        set((state) => ({
          tabs: updateActiveTabRoot(state.tabs, state.activeTabId, (root) =>
            findAndUpdate(root, id, (node) => ({
              ...node,
              axisMapping: mapping,
            })),
          ),
        })),

      undo: () =>
        set((state) => {
          const tab = getActiveTab(state)
          if (tab.undoStack.length === 0) return state
          const prev = tab.undoStack[tab.undoStack.length - 1]!
          return {
            tabs: state.tabs.map((t) =>
              t.id === tab.id
                ? { ...t, undoStack: t.undoStack.slice(0, -1), redoStack: [...t.redoStack, t.root], root: prev }
                : t,
            ),
          }
        }),

      redo: () =>
        set((state) => {
          const tab = getActiveTab(state)
          if (tab.redoStack.length === 0) return state
          const next = tab.redoStack[tab.redoStack.length - 1]!
          return {
            tabs: state.tabs.map((t) =>
              t.id === tab.id
                ? { ...t, redoStack: t.redoStack.slice(0, -1), undoStack: [...t.undoStack, t.root], root: next }
                : t,
            ),
          }
        }),

      addTab: (type, editingFunctionId, name) => {
        const state = get()

        // If adding an editor tab for an existing function, just focus it
        if (type === 'editor' && editingFunctionId) {
          const existing = state.tabs.find(
            (t) => t.type === 'editor' && t.editingFunctionId === editingFunctionId,
          )
          if (existing) {
            set({ activeTabId: existing.id, focusedPanelId: null })
            return
          }
        }

        // Auto-name plot tabs as "Tab N" with next unused number
        let tabName = name
        if (!tabName) {
          if (type === 'plot') {
            const usedNumbers = state.tabs
              .filter((t) => t.type === 'plot')
              .map((t) => {
                const m = t.name.match(/^Tab (\d+)$/)
                return m ? parseInt(m[1]!, 10) : 0
              })
            let n = 1
            while (usedNumbers.includes(n)) n++
            tabName = `Tab ${n}`
          } else {
            tabName = 'New Function'
          }
        }

        const newId = `tab-${Date.now()}`
        const newTab: TabDef = {
          id: newId,
          name: tabName,
          type,
          root: makePlotNode(),
          undoStack: [],
          redoStack: [],
          ...(editingFunctionId ? { editingFunctionId } : {}),
        }

        set((s) => ({
          tabs: [...s.tabs, newTab],
          activeTabId: newId,
          focusedPanelId: null,
        }))
      },

      closeTab: (tabId) =>
        set((state) => {
          const plotTabs = state.tabs.filter((t) => t.type === 'plot')
          // Can't close the last plot tab
          const tab = state.tabs.find((t) => t.id === tabId)
          if (tab?.type === 'plot' && plotTabs.length <= 1) return state

          const newTabs = state.tabs.filter((t) => t.id !== tabId)
          if (newTabs.length === 0) return state

          let newActiveId = state.activeTabId
          if (state.activeTabId === tabId) {
            // Switch to the previous tab (or first if none before)
            const idx = state.tabs.findIndex((t) => t.id === tabId)
            newActiveId = (state.tabs[idx - 1] ?? state.tabs[idx + 1])!.id
          }

          return { tabs: newTabs, activeTabId: newActiveId, focusedPanelId: null }
        }),

      setActiveTab: (tabId) => set({ activeTabId: tabId, focusedPanelId: null }),

      renameTab: (tabId, name) =>
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, name } : t)),
        })),

      closeEditorTabForFunction: (functionId) => {
        const state = get()
        const tab = state.tabs.find(
          (t) => t.type === 'editor' && t.editingFunctionId === functionId,
        )
        if (tab) {
          get().closeTab(tab.id)
        }
      },
    }),
    {
      name: 'webjuggler-layout',
      partialize: (state) => ({
        tabs: state.tabs
          .filter((t) => t.type === 'plot')
          .map((t) => ({ ...t, undoStack: [], redoStack: [] })),
        activeTabId: state.activeTabId,
        colorOverrides: state.colorOverrides,
      }),
      migrate: (persisted: any) => {
        if (persisted && 'root' in persisted && !('tabs' in persisted)) {
          return {
            tabs: [{ id: 'tab-1', name: 'Tab 1', type: 'plot', root: persisted.root, undoStack: [], redoStack: [] }],
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
)

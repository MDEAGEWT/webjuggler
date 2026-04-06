import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LayoutNode, PlotNode } from '../types'

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

interface LayoutState {
  root: LayoutNode
  focusedPanelId: string | null
  undoStack: LayoutNode[]
  redoStack: LayoutNode[]
  setFocusedPanel: (id: string) => void
  splitPanel: (id: string, direction: 'vertical' | 'horizontal') => void
  closePanel: (id: string) => void
  addSeries: (id: string, fields: string[]) => void
  removeSeries: (id: string, field: string) => void
  clearSeries: (id: string) => void
  setPlotMode: (id: string, mode: 'timeseries' | 'xy' | '3d' | 'attitude') => void
  setDisplayMode: (id: string, mode: 'graph' | 'compass') => void
  undo: () => void
  redo: () => void
}

const pushUndo = (state: LayoutState) => ({
  undoStack: [...state.undoStack.slice(-50), state.root],
  redoStack: [] as LayoutNode[],
})

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      root: makePlotNode(),
      focusedPanelId: null,
      undoStack: [],
      redoStack: [],

      setFocusedPanel: (id) => set({ focusedPanelId: id }),

      splitPanel: (id, direction) =>
        set((state) => ({
          ...pushUndo(state),
          root: findAndReplace(state.root, id, (existing) => ({
            type: 'split',
            direction,
            children: [
              { ...existing },
              makePlotNode(),
            ],
          })),
        })),

      closePanel: (id) =>
        set((state) => {
          const result = removePlot(state.root, id)
          return { ...pushUndo(state), root: result ?? makePlotNode() }
        }),

      addSeries: (id, fields) =>
        set((state) => ({
          ...pushUndo(state),
          root: findAndUpdate(state.root, id, (node) => {
            const newSeries = [...new Set([...node.series, ...fields])]
            // Determine plot mode based on how fields are dropped:
            // - Multi-drop of 2 fields on an empty panel → 'xy'
            // - Multi-drop of 3+ fields on an empty panel → '3d'
            // - Single field drops keep/set 'timeseries'
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
            // If already timeseries and adding one at a time, stay timeseries
            return { ...node, series: newSeries, plotMode }
          }),
        })),

      removeSeries: (id, field) =>
        set((state) => ({
          ...pushUndo(state),
          root: findAndUpdate(state.root, id, (node) => ({
            ...node,
            series: node.series.filter((s) => s !== field),
          })),
        })),

      clearSeries: (id) =>
        set((state) => ({
          ...pushUndo(state),
          root: findAndUpdate(state.root, id, (node) => ({
            ...node,
            series: [],
            plotMode: 'timeseries',
          })),
        })),

      setPlotMode: (id, mode) =>
        set((state) => ({
          ...pushUndo(state),
          root: findAndUpdate(state.root, id, (node) => ({
            ...node,
            plotMode: mode,
          })),
        })),

      setDisplayMode: (id, mode) =>
        set((state) => ({
          ...pushUndo(state),
          root: findAndUpdate(state.root, id, (node) => ({
            ...node,
            displayMode: mode,
          })),
        })),

      undo: () =>
        set((state) => {
          if (state.undoStack.length === 0) return state
          const prev = state.undoStack[state.undoStack.length - 1]
          return {
            root: prev,
            undoStack: state.undoStack.slice(0, -1),
            redoStack: [...state.redoStack, state.root],
          }
        }),

      redo: () =>
        set((state) => {
          if (state.redoStack.length === 0) return state
          const next = state.redoStack[state.redoStack.length - 1]
          return {
            root: next,
            redoStack: state.redoStack.slice(0, -1),
            undoStack: [...state.undoStack, state.root],
          }
        }),
    }),
    {
      name: 'webjuggler-layout',
      partialize: (state) => ({ root: state.root }),
      onRehydrateStorage: () => (state) => {
        // After restoring, bump nextId past the max existing plot ID
        if (state?.root) {
          const max = maxPlotId(state.root)
          if (max >= nextId) {
            nextId = max + 1
          }
        }
      },
    },
  ),
)

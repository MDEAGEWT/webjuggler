import { create } from 'zustand'
import type { LayoutNode, PlotNode } from '../types'

let nextId = 1
function makePlotNode(): PlotNode {
  return { type: 'plot', id: `plot-${nextId++}`, series: [] }
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
  splitPanel: (id: string, direction: 'vertical' | 'horizontal') => void
  closePanel: (id: string) => void
  addSeries: (id: string, fields: string[]) => void
  clearSeries: (id: string) => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  root: makePlotNode(),

  splitPanel: (id, direction) =>
    set((state) => ({
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
      return { root: result ?? makePlotNode() }
    }),

  addSeries: (id, fields) =>
    set((state) => ({
      root: findAndUpdate(state.root, id, (node) => ({
        ...node,
        series: [...new Set([...node.series, ...fields])],
      })),
    })),

  clearSeries: (id) =>
    set((state) => ({
      root: findAndUpdate(state.root, id, (node) => ({
        ...node,
        series: [],
      })),
    })),
}))

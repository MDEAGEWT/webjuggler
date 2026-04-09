import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CustomFunctionDef } from '../types'
import { evaluateExpression } from '../components/CustomFunction/evaluateExpression'
import { useDataStore } from './useDataStore'
import { useLayoutStore } from './useLayoutStore'

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
        useLayoutStore.getState().removeSeriesFromAll(dataKey)
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
          .filter((d): d is NonNullable<typeof d> => d != null)

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

import { create } from 'zustand'
import { data as fetchData } from '../api/files'
import type { FieldData } from '../types'
import { getFileTimeOffset, fileIdFromKey } from '../utils/timeOffset'

interface DataState {
  data: Record<string, FieldData>
  adjustedData: Record<string, FieldData>
  fetchFields: (fields: string[]) => Promise<void>
  clearFileData: (fileId: string) => void
  setCustomData: (key: string, data: FieldData) => void
  removeCustomData: (key: string) => void
  recomputeAdjusted: () => void
}

export const useDataStore = create<DataState>((set, get) => ({
  data: {},
  adjustedData: {},

  fetchFields: async (fields) => {
    // Only fetch fields not already cached
    const cached = get().data
    const missing = fields.filter((f) => !cached[f] && !f.startsWith('custom:'))
    if (missing.length === 0) return

    // Group by fileId (fields are "fileId:topic/field")
    const byFile = new Map<string, string[]>()
    for (const f of missing) {
      const colonIdx = f.indexOf(':')
      if (colonIdx === -1) continue
      const fid = f.substring(0, colonIdx)
      const fieldPath = f.substring(colonIdx + 1)
      if (!byFile.has(fid)) byFile.set(fid, [])
      byFile.get(fid)!.push(fieldPath)
    }

    try {
      for (const [fid, fieldPaths] of byFile) {
        const result = await fetchData(fid, fieldPaths)
        // Store with full composite key "fileId:fieldPath"
        const mapped: Record<string, FieldData> = {}
        for (const [path, fieldData] of Object.entries(result)) {
          mapped[`${fid}:${path}`] = fieldData
        }
        set((state) => ({
          data: { ...state.data, ...mapped },
        }))
      }
      // Re-evaluate custom functions now that new source data is available
      const { useCustomFunctionStore } = await import('./useCustomFunctionStore')
      setTimeout(() => useCustomFunctionStore.getState().evaluateAll(), 0)
      setTimeout(() => get().recomputeAdjusted(), 10)
    } catch (err) {
      console.error('Failed to fetch field data:', err)
      const { useToastStore } = await import('./useToastStore')
      useToastStore.getState().addToast('Failed to fetch field data', 'error')
    }
  },

  clearFileData: (fileId) => {
    set((state) => {
      const data: Record<string, FieldData> = {}
      for (const [key, val] of Object.entries(state.data)) {
        if (!key.startsWith(fileId + ':')) {
          data[key] = val
        }
      }
      return { data }
    })
    // Re-evaluate custom functions (some may depend on deleted file's data)
    import('./useCustomFunctionStore').then((m) =>
      setTimeout(() => m.useCustomFunctionStore.getState().evaluateAll(), 0)
    )
    setTimeout(() => get().recomputeAdjusted(), 10)
  },

  setCustomData: (key, fieldData) => {
    set((state) => ({
      data: { ...state.data, [key]: fieldData },
    }))
    setTimeout(() => get().recomputeAdjusted(), 10)
  },

  removeCustomData: (key) =>
    set((state) => {
      const { [key]: _, ...rest } = state.data
      return { data: rest }
    }),

  recomputeAdjusted: () => {
    // Use async IIFE to allow dynamic imports without circular dep issues
    void (async () => {
      const state = get()
      const { useFileStore } = await import('./useFileStore')
      const { useSettingsStore } = await import('./useSettingsStore')
      const files = useFileStore.getState().files
      const timeMode = useSettingsStore.getState().timeMode

      let customFunctions: Record<string, { name: string; mainInput: string }> = {}
      try {
        const { useCustomFunctionStore } = await import('./useCustomFunctionStore')
        customFunctions = useCustomFunctionStore.getState().functions
      } catch { /* ignore if not loaded yet */ }

      const adjusted: Record<string, FieldData> = {}
      for (const [key, fd] of Object.entries(state.data)) {
        let fid: string
        if (key.startsWith('custom:')) {
          const fnName = key.substring(7)
          const fn = Object.values(customFunctions).find((f) => f.name === fnName)
          fid = fn ? fileIdFromKey(fn.mainInput) : ''
        } else {
          fid = fileIdFromKey(key)
        }
        const offset = getFileTimeOffset(fid, files, timeMode)
        if (offset === 0) {
          adjusted[key] = fd
        } else {
          adjusted[key] = {
            timestamps: Float64Array.from(fd.timestamps, (t: number) => t + offset),
            values: fd.values,
          }
        }
      }
      set({ adjustedData: adjusted })
    })()
  },
}))

import { create } from 'zustand'
import { data as fetchData } from '../api/files'
import type { FieldData } from '../types'

interface DataState {
  data: Record<string, FieldData>
  fetchFields: (fields: string[]) => Promise<void>
  clearFileData: (fileId: string) => void
  setCustomData: (key: string, data: FieldData) => void
  removeCustomData: (key: string) => void
}

export const useDataStore = create<DataState>((set, get) => ({
  data: {},

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
    } catch (err) {
      console.error('Failed to fetch field data:', err)
      const { useToastStore } = await import('./useToastStore')
      useToastStore.getState().addToast('Failed to fetch field data', 'error')
    }
  },

  clearFileData: (fileId) =>
    set((state) => {
      const data: Record<string, FieldData> = {}
      for (const [key, val] of Object.entries(state.data)) {
        if (!key.startsWith(fileId + ':')) {
          data[key] = val
        }
      }
      return { data }
    }),

  setCustomData: (key, fieldData) =>
    set((state) => ({
      data: { ...state.data, [key]: fieldData },
    })),

  removeCustomData: (key) =>
    set((state) => {
      const { [key]: _, ...rest } = state.data
      return { data: rest }
    }),
}))

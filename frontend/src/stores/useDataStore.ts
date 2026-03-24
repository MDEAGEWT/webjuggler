import { create } from 'zustand'
import { data as fetchData } from '../api/files'
import type { FieldData } from '../types'

interface DataState {
  data: Record<string, FieldData>
  fetchFields: (fileId: string, fields: string[]) => Promise<void>
}

export const useDataStore = create<DataState>((set, get) => ({
  data: {},

  fetchFields: async (fileId, fields) => {
    // Only fetch fields not already cached
    const cached = get().data
    const missing = fields.filter((f) => !cached[f])
    if (missing.length === 0) return

    try {
      const result = await fetchData(fileId, missing)
      set((state) => ({
        data: { ...state.data, ...result },
      }))
    } catch (err) {
      console.error('Failed to fetch field data:', err)
    }
  },
}))

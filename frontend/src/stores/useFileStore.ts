import { create } from 'zustand'
import { topics as fetchTopics } from '../api/files'
import type { Topic } from '../types'

interface FileState {
  currentFileId: string | null
  currentFilename: string | null
  topics: Topic[]
  setFile: (id: string, filename: string) => Promise<void>
}

export const useFileStore = create<FileState>((set) => ({
  currentFileId: null,
  currentFilename: null,
  topics: [],

  setFile: async (id, filename) => {
    set({ currentFileId: id, currentFilename: filename, topics: [] })
    try {
      const t = await fetchTopics(id)
      set({ topics: t })
    } catch (err) {
      console.error('Failed to fetch topics:', err)
      const { useToastStore } = await import('./useToastStore')
      useToastStore.getState().addToast('Failed to load topics', 'error')
    }
  },
}))

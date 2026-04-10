import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { topics as fetchTopics, info as fetchInfo } from '../api/files'
import type { Topic } from '../types'

export interface LoadedFile {
  fileId: string
  filename: string
  shortName: string  // filename without .ulg extension
  topics: Topic[]
  startTimeMicros: number
  gpsOffsetUs: number | null
}

interface FileState {
  files: LoadedFile[]
  addFile: (fileId: string, filename: string) => Promise<void>
  removeFile: (fileId: string) => void
}

function deriveShortName(filename: string): string {
  return filename.replace(/\.ulg$/i, '')
}

export const useFileStore = create<FileState>()(
  persist(
    (set, get) => ({
      files: [],

      addFile: async (fileId, filename) => {
        // Don't add duplicates
        if (get().files.some((f) => f.fileId === fileId)) return

        const shortName = deriveShortName(filename)
        // Add placeholder entry immediately
        set((state) => ({
          files: [...state.files, { fileId, filename, shortName, topics: [], startTimeMicros: 0, gpsOffsetUs: null }],
        }))

        try {
          const [t, infoData] = await Promise.all([
            fetchTopics(fileId),
            fetchInfo(fileId),
          ])
          set((state) => ({
            files: state.files.map((f) =>
              f.fileId === fileId
                ? { ...f, topics: t, startTimeMicros: infoData.startTimeMicros, gpsOffsetUs: infoData.gpsOffsetUs }
                : f,
            ),
          }))
          // Trigger adjustedData recomputation
          const { useDataStore } = await import('./useDataStore')
          useDataStore.getState().recomputeAdjusted()
        } catch (err) {
          console.error('Failed to fetch topics:', err)
          const { useToastStore } = await import('./useToastStore')
          useToastStore.getState().addToast('Failed to load topics', 'error')
          // Remove the failed entry
          set((state) => ({
            files: state.files.filter((f) => f.fileId !== fileId),
          }))
        }
      },

      removeFile: (fileId) => {
        set((state) => ({
          files: state.files.filter((f) => f.fileId !== fileId),
        }))
        import('./useDataStore').then((m) => m.useDataStore.getState().recomputeAdjusted())
      },
    }),
    {
      name: 'webjuggler-files',
      partialize: (state) => ({ files: state.files }),
    },
  ),
)

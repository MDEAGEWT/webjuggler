import { apiFetch } from './client'

export interface NasEntry {
  name: string
  type: 'dir' | 'file'
  size?: number
}

interface BrowseResponse {
  path: string
  entries: NasEntry[]
  summary: Record<string, any> | null
}

export function browse(path: string): Promise<BrowseResponse> {
  return apiFetch<BrowseResponse>(`/nas/browse?path=${encodeURIComponent(path)}`)
}

interface OpenResponse {
  files: { fileId?: string; filename: string; size?: number; status?: string; error?: string }[]
}

export function openFiles(paths: string[]): Promise<OpenResponse> {
  return apiFetch<OpenResponse>('/nas/open', {
    method: 'POST',
    body: JSON.stringify({ paths }),
  })
}

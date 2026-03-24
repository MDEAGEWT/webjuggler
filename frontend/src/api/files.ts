import { apiFetch } from './client'
import type { Topic, FileInfo, FieldData, DropoutInfo } from '../types'

export function upload(file: File): Promise<FileInfo> {
  const form = new FormData()
  form.append('file', file)
  return apiFetch<FileInfo>('/files/upload', {
    method: 'POST',
    body: form,
  })
}

export function list(): Promise<FileInfo[]> {
  return apiFetch<FileInfo[]>('/files')
}

export function deleteFile(id: string): Promise<void> {
  return apiFetch<void>(`/files/${id}`, { method: 'DELETE' })
}

export function topics(id: string): Promise<Topic[]> {
  return apiFetch<Topic[]>(`/files/${id}/topics`)
}

export function info(id: string): Promise<FileInfo> {
  return apiFetch<FileInfo>(`/files/${id}/info`)
}

interface DataResponse {
  fields: Record<string, { timestamps: number[]; values: number[] }>
  dropouts: DropoutInfo[]
}

export async function data(
  id: string,
  fields: string[],
): Promise<Record<string, FieldData>> {
  const res = await apiFetch<DataResponse>(`/files/${id}/data`, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  })

  const result: Record<string, FieldData> = {}
  for (const [key, val] of Object.entries(res.fields)) {
    result[key] = {
      timestamps: Float64Array.from(val.timestamps),
      values: Float64Array.from(val.values),
    }
  }
  return result
}

interface FileMeta {
  fileId: string
  startTimeMicros: number
  gpsOffsetUs: number | null
}

export function getFileTimeOffset(
  fileId: string,
  files: FileMeta[],
  timeMode: 'boot' | 'gps',
): number {
  const file = files.find((f) => f.fileId === fileId)
  if (!file) return 0

  if (timeMode === 'boot') {
    const earliest = Math.min(...files.map((f) => f.startTimeMicros))
    return (file.startTimeMicros - earliest) / 1_000_000
  }

  if (timeMode === 'gps' && file.gpsOffsetUs != null) {
    const gpsAbsolute = (f: FileMeta) => f.startTimeMicros + (f.gpsOffsetUs ?? 0)
    const allGpsStarts = files
      .filter((f) => f.gpsOffsetUs != null)
      .map(gpsAbsolute)
    const earliestGps = Math.min(...allGpsStarts)
    return (gpsAbsolute(file) - earliestGps) / 1_000_000
  }

  return 0
}

export function fileIdFromKey(compositeKey: string): string {
  if (compositeKey.startsWith('custom:')) return ''
  const idx = compositeKey.indexOf(':')
  return idx >= 0 ? compositeKey.substring(0, idx) : ''
}

export async function getConfig(): Promise<{ mode: 'solo' | 'nas'; nextcloudUrl: string }> {
  const res = await fetch('/api/config')
  return res.json()
}

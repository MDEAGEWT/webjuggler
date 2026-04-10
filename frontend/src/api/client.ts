const BASE = '/api'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Don't set Content-Type for FormData (browser sets multipart boundary)
  if (!(init?.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  })

  if (res.status === 401) {
    // Auth endpoints: let the caller handle 401 (wrong credentials)
    if (path.startsWith('/auth/')) {
      const text = await res.text()
      throw new ApiError(401, text || 'Invalid credentials')
    }
    // SOLO mode: 401 should not happen
    const { useConfigStore } = await import('../stores/useConfigStore')
    if (useConfigStore.getState().mode === 'solo') {
      console.warn('Unexpected 401 in SOLO mode')
      throw new ApiError(401, 'Unauthorized')
    }
    // NAS mode: session expired
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    const { useToastStore } = await import('../stores/useToastStore')
    useToastStore.getState().addToast('Session expired, please login again', 'error')
    window.location.reload()
    throw new ApiError(401, 'Unauthorized')
  }

  if (!res.ok) {
    const text = await res.text()
    throw new ApiError(res.status, text || res.statusText)
  }

  const contentType = res.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    return res.json() as Promise<T>
  }

  return undefined as unknown as T
}

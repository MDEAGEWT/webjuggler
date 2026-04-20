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
    // Auth endpoints: surface a clean, user-facing message to LoginPage
    if (path.startsWith('/auth/')) {
      const text = await res.text()
      let message = 'Incorrect username or password. Please try again.'
      try {
        const parsed = JSON.parse(text) as { error?: string }
        if (parsed.error && parsed.error !== 'invalid credentials') {
          message = parsed.error
        }
      } catch {
        if (text) message = text
      }
      throw new ApiError(401, message)
    }
    // Session expired: logout cleanly so App re-renders LoginPage (NAS mode)
    const { useConfigStore } = await import('../stores/useConfigStore')
    if (useConfigStore.getState().mode === 'nas') {
      const { useAuthStore } = await import('../stores/useAuthStore')
      const { useToastStore } = await import('../stores/useToastStore')
      // Dedupe toast when multiple parallel requests hit 401 at once
      const hadToken = useAuthStore.getState().token !== null
      useAuthStore.getState().logout()
      if (hadToken) {
        useToastStore.getState().addToast('Session expired — please log in again', 'error')
      }
    } else {
      console.warn('Unexpected 401 in SOLO mode')
    }
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

import { create } from 'zustand'

interface Toast {
  id: string
  message: string
  type: 'error' | 'success' | 'info'
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, type: Toast['type']) => void
  removeToast: (id: string) => void
}

let nextToastId = 0

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (message, type) => {
    const id = `toast-${nextToastId++}`
    const toast: Toast = { id, message, type }

    set((state) => {
      // Keep max 3 toasts, drop oldest if needed
      const toasts = [...state.toasts, toast]
      return { toasts: toasts.slice(-3) }
    })

    // Auto-remove after 4 seconds
    setTimeout(() => {
      get().removeToast(id)
    }, 4000)
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))

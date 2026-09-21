import { createContext, useContext } from 'react'

export interface ToastMessage {
  id: string
  text: string
  type: 'success' | 'error' | 'info'
}

export interface ToastContextValue {
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void
}

export const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}

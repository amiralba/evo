import { create } from 'zustand'

export interface ToastButton {
  label: string
  onClick: () => void
}

interface ToastState {
  message: string | null
  buttons: ToastButton[]
  show: (message: string, buttons?: ToastButton[]) => void
  dismiss: () => void
}

/** Mirrors the prototype's global `toast(msg, btns)` (evo-planner-prototype-v0.5.html:1903-1914) —
 * one toast at a time, a new call replaces whatever is showing. */
export const useToastStore = create<ToastState>((set) => ({
  message: null,
  buttons: [],
  show: (message, buttons = []) => set({ message, buttons }),
  dismiss: () => set({ message: null, buttons: [] }),
}))

/** Non-hook escape hatch for use in mutation onSuccess/onError callbacks and other non-component code. */
export function toast(message: string, buttons: ToastButton[] = []) {
  useToastStore.getState().show(message, buttons)
}

import { useEffect } from 'react'
import { useToastStore } from '../state/toastStore'

const AUTO_DISMISS_MS = 7000

/** Ported from the prototype's global `toast()` (evo-planner-prototype-v0.5.html:1903-1914) — a
 * single dark pill, bottom-center, 7s auto-dismiss, optional action buttons + a ✕ close button. */
export function Toast() {
  const message = useToastStore((s) => s.message)
  const buttons = useToastStore((s) => s.buttons)
  const dismiss = useToastStore((s) => s.dismiss)

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [message, dismiss])

  if (!message) return null

  return (
    <div className="toast" data-testid="toast">
      <span>{message}</span>
      {buttons.map((b, i) => (
        <button
          key={i}
          type="button"
          className="act"
          onClick={() => {
            b.onClick()
            dismiss()
          }}
        >
          {b.label}
        </button>
      ))}
      <button type="button" onClick={dismiss} aria-label="dismiss">
        ✕
      </button>
    </div>
  )
}

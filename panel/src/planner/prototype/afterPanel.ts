const handlers: Array<() => void> = []

/**
 * Register a hook that runs after the prototype's renderPanel paints. engine.js's renderPanel is
 * wrapped (extractor) to call window.__evoAfterPanel; this dispatches to every registered hook, so
 * multiple bridges (tasks tab, schedule-days editor, …) can each augment the detail panel without
 * clobbering one another. Deduped, so StrictMode double-registration is harmless.
 */
export function registerAfterPanel(fn: () => void): void {
  if (!handlers.includes(fn)) handlers.push(fn)
  ;(window as unknown as { __evoAfterPanel?: () => void }).__evoAfterPanel = () => {
    for (const h of handlers) {
      try {
        h()
      } catch (e) {
        console.error('[evo] afterPanel', e)
      }
    }
  }
}

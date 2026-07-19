import * as planner from '../../api/planner'

/**
 * Persists inbox note actions. Resolving a field note (💬 Saha → "Çözüldü") is field
 * communication, not a schedule effect, so it commits immediately (NoteStatus 3 = resolved) —
 * no draft-until-publish. Wired to the engine's doneBtn handler via window.__evoResolveNote.
 */
export function installNotesBridge(): void {
  ;(window as unknown as { __evoResolveNote?: (id: string) => void }).__evoResolveNote = (id: string) => {
    void planner.updateNoteStatus(id, { status: 3 }).catch((e) => console.error('[evo] resolve note', e))
  }
}

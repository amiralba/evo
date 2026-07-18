# React Panel Prototype-Parity Refactor — Kickoff Prompt

> Paste the block below into a fresh Claude Code session **after the build (M4+) is finished**, when
> you're ready to make the React panel match the prototype exactly. Adjust the "Scope for THIS pass"
> line to whatever surface you want to tackle first (start small — one surface per pass).

---

I want to refactor the EVO React panel (`panel/src`) so it matches the v0.5 prototype **exactly** —
visually and in interaction behavior. This is the manual parity pass we planned; the build is now done.

## Read these FIRST, before touching any code
1. `docs/prototype-parity/00-comparison-gap-matrix.md` — the synthesis. It has the parity matrix, the
   ranked work-order (§8), the token/geometry diffs (§7), the deferred ledger (§5, do NOT touch those),
   and the dead-code / do-not-port list (§6). Treat §5 as hard out-of-scope.
2. `docs/prototype-parity/01-prototype-analysis.md` — exact prototype structure, modals, interactions, tokens.
3. `docs/prototype-parity/02-react-implementation.md` — what the panel ships today.
4. `docs/prototype-parity/03-design-doc-ui-contract.md` — the written UI intent.
5. `EVO-Route-Planning-Design.md` — the design doc / plan. Re-read §6 (Planner UI/UX) and §10
   (decisions log) for the surface you're changing. The design doc is the statement of intent; where it
   and the prototype agree and React differs, that's the gap to close.

## Open the prototype and SEE it — do not work from the code reading alone
- Read the prototype source directly: `evo-planner-prototype-v0.5.html` (HTML + inline `<style>` +
  inline `<script>`). Trace the JS handler for every control you're about to reproduce.
- **Open the prototype in a browser and look at it visually.** Use the Chrome / Playwright browser tools:
  navigate to `file:///Users/amiralba/Documents/projects/EVO/evo-planner-prototype-v0.5.html`, take
  screenshots, and actually exercise the interaction you're porting — open the modal, do the drag, hover
  the block, trigger the toast — so you match real behavior (open/close, animation, what's a modal vs a
  sidebar vs an inline expander, what each button does), not just the static markup.
- Then run the current React panel the same way and screenshot the equivalent screen, so you compare
  side-by-side (per the `design-system` skill's visual-verification workflow).

## Rules for the refactor
- Invoke the `design-system` skill and follow its anti-visual-bug workflow (prototype = canonical
  reference; shared components + tokens only; implement loading/empty/error/success + hover/drag/
  selected/disabled/focus states; screenshot-compare against the prototype and list intentional diffs).
- Follow `CLAUDE.md`: stay in scope, read before writing, evidence over claims (`verification` skill),
  update docs with code, conventional commits referencing the spec/slug.
- **One source of truth for tokens** — reconcile `theme/tokens.ts` vs `planner.css` vars before adding UI
  (see `00` §7). No hardcoded values; tokens only.
- Do NOT reproduce the prototype's dead code or inconsistencies (`00` §6): legacy `renderAdmin`/presets,
  `presetsData`, `prompt()`-based rename, no-op mock buttons, inconsistent backdrop-close. Pick one clean
  behavior.
- Do NOT build anything on the deferred ledger (`00` §5 / `03` §5) unless I explicitly say the milestone
  changed.

## Scope for THIS pass
<!-- Fill in ONE surface. Recommended order is 00-comparison-gap-matrix.md §8. Example: -->
Start with the **toast system** (`00` §0/§8 item 1) — the prototype's primary decision surface
(patch-vs-permanent "Kalıcı yap", the duration scope ladder, undo). Most other interaction parity
depends on it. Wire the existing drag-patch and resize flows through it to match the prototype's toasts.

## Deliver
1. First: a short plan — which prototype elements you're matching, the exact React files you'll change,
   and any intentional differences, with prototype screenshots as evidence. **Report the plan before
   editing code and wait for my go.**
2. Then implement, with before/after screenshots vs the prototype and the interaction states checked.
3. End with the `design-system` checklist + a 1-minute manual test script for me (exact URL/clicks, what
   it should look like, which prototype section to compare against).

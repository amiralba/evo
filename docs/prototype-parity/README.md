> **SUPERSEDED (2026-07-20):** the React panel was replaced by hosting the v0.5 prototype
> verbatim (`/planner` mounts `evo-planner-prototype-v0.5.html` via `PrototypeHost.tsx`, backend
> wired in through bridge modules — see `docs/DECISIONS.md`, "prototype-verbatim pivot"). This
> analysis's premise — manually refactoring the React panel toward the prototype — no longer
> applies. Kept as historical analysis only, not an active plan.

# Prototype-Parity Analysis

Research-only analysis (no code changes) comparing the EVO planner **v0.5 HTML prototype** and the
**design doc** against the **shipped React panel** (`panel/src`, labelled v0.6). Produced to plan a
future "make React match the prototype exactly" pass. Nothing here changes application code.

## Read order

1. **`00-comparison-gap-matrix.md`** — START HERE. The synthesis: side-by-side parity matrix, the #1
   finding (no toast layer), what's a real gap vs intentionally deferred vs dead code, token/geometry
   diffs, and a suggested future work-order.
2. `01-prototype-analysis.md` — exhaustive dissection of `evo-planner-prototype-v0.5.html` (regions,
   ~19 modals, sidebars/tabs, every interaction, JS behaviors, design tokens, mock data, dead code).
3. `02-react-implementation.md` — inventory of what the React panel actually ships (routes, every
   component, drag/resize/patch/publish mechanics, tokens/CSS, gaps & stubs).
4. `03-design-doc-ui-contract.md` — the written UI/UX intent from `EVO-Route-Planning-Design.md`
   (§6 + §10 decisions) and the deferred-vs-built ledger (so deferrals aren't mistaken for bugs).

## Key takeaways

- The React port is **faithful but partial**. Map + single-route schedule (drag/resize/patch),
  route detail (health/stops/tasks/history), patch/publish flows, task rule-scope, and notes inbox
  are real. The larger workspace surfaces (full table, multi-row schedule, Effective/Base, Onarım,
  analytics, live-location, category coloring) are absent — mostly **by M4/deferred decision**.
- **Biggest true parity gap: there is no toast system in React.** The prototype routes its core
  decisions (patch-vs-permanent, duration scope ladder, undo) through 7-second toasts. This is the
  prerequisite for most interaction parity.
- **Tokens match 1:1** (extracted from the prototype), but live in two copies (`theme/tokens.ts` +
  `planner.css` vars) — a drift seam to close first. **Schedule geometry differs** (09:00–18:00 @
  1.2px/min vs 06:00–23:00 @ 0.5px/min) — a deliberate visual decision to make.
- Before treating any "missing" surface as a bug, check `00` §5 / `03` §5 — the deferred ledger.

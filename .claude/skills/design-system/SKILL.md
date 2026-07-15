---
name: design-system
description: EVO UI/UX consistency playbook. Use when building or changing ANY panel or mobile UI — covers the prototype-as-reference rule, visual verification workflow, shared components, and mandatory states. Goal - minimum visual bugs.
---

# Design System — EVO

## Sources of truth
- **`evo-planner-prototype-v0.5.html` is the visual + interaction reference.** Every panel screen/component matches its layout, spacing, colors, and behavior unless a spec says otherwise. Extract its CSS values into design tokens in spec 001 (panel scaffold) — after that, tokens only, never hardcoded values.
- Design doc §6 (Planner UI/UX) — the written contract for layout, panes, filtering, publish flow.
- UI strings: Turkish (i18n-ready keys); code identifiers English.

## Anti-visual-bug workflow (mandatory for every UI task)
1. **Before coding:** open the prototype, find the equivalent element, note its exact structure.
2. **Build with shared components only** — one modal, one table renderer (`renderDataTable` pattern), one `ModuleListEditor` reused with scope as prop (design §10). Duplicated UI code is where visual drift starts. New component ONLY if nothing existing fits — and it goes in the shared library.
3. **After coding — visual verification (evidence, not claims):**
   - Run the panel, exercise the change by hand
   - Playwright screenshot of the changed screen(s) in the task's Verify step
   - Compare side-by-side against the prototype; list any intentional differences
   - Check interaction states: hover, drag, selected, disabled, focused
4. Playwright visual regression tests for the core workspace (map/schedule/table layout, route panel, publish modal) — run in CI; any pixel diff is a failing test to explain.

## Layout rules (from design §6.0)
- ONE page. Map | Schedule split + Table drawer/preset — layout presets, never navigation.
- One shared filter/selection state drives all panes; test that a selection made in any pane reflects in the others.
- Desktop-first: planner targets desktop screens; define one min supported width in spec 001 and test at it. Mobile app is a separate React Native surface.

## Every screen MUST handle
1. **Loading** — skeleton matching final layout (no spinners that reflow)
2. **Empty** — message + primary action (e.g. empty pool: "Tüm mağazalar rutlarda")
3. **Error** — ProblemDetails → toast (Turkish, plain language); validation → inline; never raw errors
4. **Success** — toast; destructive/Turkey-wide actions use the draft → Kaydet → confirm-modal pattern (design §5 settings)

## UX conventions (decided in design §10 — do not re-decide)
- Drag = patch-for-this-week by default, toast offers "Kalıcı yap" with impact count
- Duration edits: rubber-band preview, downstream blocks ghost-shift live
- Read-only past weeks: mutating controls disabled, not hidden
- Warnings never block; publish gate collects them with justification field
- Keyboard: `/` or Cmd+K search; Esc clears filter/selection

## Checklist (UI task not done until all pass)
- [ ] Matches prototype v0.5 (screenshot compared, diffs listed)
- [ ] Shared components/tokens only — no new one-off styles
- [ ] Loading/empty/error/success states implemented
- [ ] Interaction states checked (hover/drag/selected/disabled/focus)
- [ ] Cross-pane state sync verified
- [ ] Turkish strings via i18n keys
- [ ] **Human eye test requested** — at the phase checkpoint, give the human a 1-minute manual test script: exact URL/clicks, what the screen should look like, which prototype section to compare against. AI visual checks miss what humans catch (spacing feel, jank, wrong emphasis); the human is the final visual gate.

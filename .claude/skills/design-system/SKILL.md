---
name: design-system
description: UI/UX consistency playbook. Use when designing or building any page, screen, component, or user-facing flow — covers visual style, components, and mandatory error/loading/empty states.
---

# Design System

<!-- FILL THIS IN PER PROJECT (the setup agent does this from your sources).
     Sources to pull from: existing design templates/Figma, brand guide,
     an existing page that looks right, component library docs. -->

## Sources of truth
- Component library: <e.g. src/components/ui — always use these, never raw elements>
- Reference page: <e.g. src/pages/profile — copy its patterns for new pages>
- Design tokens/theme: <file path>
- Brand guide / Figma: <link or path>

## Visual rules
- Colors: <only theme tokens, never hardcoded hex>
- Typography: <scale, e.g. h1–h4 + body + caption only>
- Spacing: <e.g. 4px grid; use theme spacing tokens>
- Icons: <library, size rules>
- Responsiveness: <breakpoints, mobile-first?>

## Every page/screen MUST handle
1. **Loading state** — <pattern, e.g. skeleton, not spinner>
2. **Empty state** — <pattern: message + primary action>
3. **Error state** — see below
4. **Success feedback** — <pattern, e.g. toast>

## Error handling (UI)
- API errors → <e.g. toast using message from shared error shape>
- Validation errors → <e.g. inline under the field, on blur>
- Fatal/route errors → <e.g. error boundary page with retry>
- Never: raw error objects, stack traces, or silent failures shown to users.
- Error message tone: <e.g. plain language, say what to do next>

## UX conventions
- Forms: <label position, required marking, submit behavior, disable-while-pending>
- Destructive actions: <confirmation pattern>
- Navigation: <where new pages live, breadcrumb/back rules>
- Accessibility: <e.g. keyboard navigable, labels on inputs, contrast AA>

## Checklist (before a page is "done")
- [ ] Only design-system components and tokens used
- [ ] Loading, empty, error, success states all implemented
- [ ] Error handling follows the rules above
- [ ] Matches the reference page's patterns
- [ ] Works at mobile and desktop widths

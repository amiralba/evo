# GPT Brainstorm — Idea Log

Running, **decide-later** log of our design probe with GPT (cross-checked against Gemini). We sent a neutral problem brief (`EVO-Design-Brief-for-Review.md`) with one imposed constraint — "everything on one page" — then asked sharpening follow-ups. **Everything below is captured, nothing is decided.** We'll triage later. Kept updated as we go.

Legend for the "vs ours" column: **have** = already in v0.4 · **new** = net-new idea · **diverges** = conflicts with a decision we already made.

---

## Meta-observation

Both GPT and Gemini, given only the problem, **independently reconstructed almost exactly the architecture we already built**: three panes, a map/timeline relationship, a contextual inspector, draft-before-publish, and a base → override → actual layer model. So the core layout isn't the interesting part — the **deltas** are.

---

## Follow-up questions to GPT (progress tracker)

1. **Density at scale** — page at 400 stores / 15 people; find + edit one store's Thursday visit in <10s. — *answered*
2. **Temporary vs. permanent** — UI for "this week only" vs. "make permanent"; marking/reverting/showing overrides. — *answered*
3. **AI assistant** — spec the single highest-ROI AI feature concretely. — *answered (GPT narrowed 6→1: Schedule Repair)*
4. **Travel time & optimization** — hard constraint / soft warning / ignore in v1; MVP + timeline display. — *answered (GPT: travel = hard constraint, no optimization in V1)*
5. **Conflict detection** — exact live rules; block vs. warn; showing 5+ warnings without noise. — *answered (GPT: compiler-style severity model + Conflict Center + scope-based placement)*
6. **Publish → field** — full publish step, notification timing, field payload, read/ack tracking. — *answered (GPT: publish as the core handoff; closed-loop "Understood" state)*

---

## Full idea inventory (all sources, decide later)

Sources: `gpt-ideas.md`, `gpt-pds.md`, and Q&A follow-ups.

### Navigation & interaction
- Command palette (Cmd/Ctrl+K) for global actions — **new**
- Keyboard shortcut to focus search (Cmd/Ctrl+K or `/`) — **new** (we only bind Cmd/Ctrl+Z)
- Search result scrolls the schedule to the block (`scrollIntoView`) + outline highlight — **new** (we focus + highlight but never scroll)
- Global undo / redo stack, unlimited — **partly have** (we have per-change undo via Cmd/Z, not a full redo stack)
- Drag-and-drop everywhere (stores into routes, employee onto route, visit blocks) — **have**
- Multi-select + bulk operations everywhere — **have** (map lasso + selection)
- Progressive disclosure (show detail only when needed) — **have**
- Auto-save continuously — **have** (state is live)
- Keyboard-first for power users — **partly** (limited shortcuts today)
- Command/quick actions on every entity (pause visits, move route, add override, view KPIs) — **partly**

### Scheduling & canvas
- Center canvas: rows = merchandisers, columns = weekdays, blocks = store name + duration + status color — **have**
- Inline click-to-edit duration in the right inspector — **new** (we edit in drawer table + block-resize)
- Resize duration; downstream blocks shift live; recompute daily total — **have**
- Duplicate recurring visits — **partly** (frequency patterns generate them)
- Split routes — **new**
- Breaks / lunch modeled in the day — **have**
- Min-visit-time as a **blocking** rule with "override" — **diverges** (our principle: 450 quota warns, never blocks)
- Virtualized route list + timeline for large datasets — **new** (perf, real build)

**Travel time (Q4 — GPT: hard constraint, no optimization in V1). All new; travel absent from our model today.**
- **Travel = hard constraint, not an optimization objective** in V1: a schedule where a merchandiser physically can't reach the next store in time is **invalid and unpublishable** — **diverges** (carve-out to "warn never block"; physical impossibility ≠ workload preference)
- Rationale: a soft warning ships "fake schedules" the field worker fails before starting
- **No full route optimization in V1** — changing one store shouldn't reshuffle 20 others; planners value predictability over optimality ("keep my schedule, fix only what's broken")
- **Travel nearly invisible in the timeline:** a one-line connector between visits (🚗 12m), not a block that consumes vertical space; hover expands (distance, traffic, source)
- **Impossible-travel state:** connector shows "⚠ Impossible · Missing 15 min"; both visit cards get a red border
- **Live drag feedback:** ghost connector stretches during drag showing needed vs available; invalid drop → "Needs +4 min" → one-click **Auto Fix** shifts *only downstream* visits to restore feasibility — **partly have** (our reflow already shifts downstream on edits)
- Inspector shows Travel From / Travel To (time + km) — kept out of the main timeline
- **"Optimize Gap"** (V1, replaces a route optimizer): right-click between two visits → tries only 3 things — swap the next two, shift downstream, suggest a closer already-assigned store. Explainable, fast, safe
- **Full-day "Optimize Thursday"** (V2 only, opt-in, never automatic) with expected improvements (travel −42m, distance −18km, workload balanced, 9 affected) → Review Changes
- **"Travel Confidence"** per connector (high = same center/known route · medium = typical · low = rush hour/roadworks/sparse data); low-confidence → amber indicator + auto-reserve a small configurable buffer (~5 min) — resilience without a routing engine — **new** (standout)
- *Prototype feasibility note:* our stores already carry `x,y` coordinates — a fake travel time from Euclidean distance between consecutive stores would let us demo all of the above without a maps API

### Conflict / validation (live) — Q5, GPT's strongest structural answer
- **Compiler-style severity model** — every rule has a severity and the UI behaves consistently by it. Three tiers, not two: 🔴 **Error** (blocks publish) · 🟡 **Warning** (allowed, suboptimal) · 🔵 **Info** (allowed, worth a look) — **new** (we have an informal 2-level status bar)
- **Errors block publish; warnings/info don't** — **diverges** (our "warn never block"), but this is the clean policy that resolves the Q1/Q4 block questions: only true impossibilities/illegalities block
- **Hard errors (block):** visit overlap · impossible travel · store closed (outside opening hours) · employee unavailable (vacation/sick/contract) · daily working-hours exceeded · required task missing · skill requirement unmet — **partly** (we check cap; overlap/travel/opening-hours/skills/required-task are **new**)
- **Warnings (allow):** long travel · workload imbalance · high-value store scheduled late · frequent route changes ("moved 17 today") · excess idle gap · too many consecutive large stores — **partly** (we have imbalance/cap; the rest **new**)
- **Info:** campaign ends Friday · store unchanged 6 months — **new**
- **Live validation is scoped** — a drag revalidates only the affected employee + affected day, never the whole week — **have-ish** (we reflow per person/day; formalizing as validation is new)
- **One visual status per visit card** (severity precedence, no stacking icons/badges) — **new** (anti-"Christmas lights")
- **Day-header problem counts** (Thursday 🔴2 🟡4), click to expand — **new** (we color day totals but don't count problems)
- **Route tree summaries** in the left panel (Route A 🟡3 🔴1) — **new**
- **Conflict Center** — a dedicated right-panel list of all problems grouped by severity; clicking an item **jumps to that visit and highlights it** — **new** (this is the triage answer Q1 was missing)
- **Scope-based placement (GPT's biggest idea):** each issue lives at its *smallest meaningful scope* — visit problem on the card, travel on the connector, day-level in the day header, employee-level beside the name, route-level in the route tree, week-level in the Publish Review. Prevents clutter, scales to 400 stores — **new** (standout IA)
- **Auto Fix on every error** (Resolve Automatically / Show Suggestions) — no error is a dead end — **new / ties to Q3 & Q4**
- **Publish Review shows both tiers** ("4 blocking issues · 9 recommendations"); publishable past warnings, never past errors — **partly have** (we have a review modal; the tiered gate is new)

### AI assistant (GPT leaned hard here — all **new**)
- Workforce balancing — suggests moving stores between merchandisers
- Route optimization — minimize travel respecting constraints
- Campaign builder from natural language
- Schedule repair — auto-resolve conflicts
- Impact analysis — explain consequences before publishing
- Contextual nudge (e.g. "you freed 15 min Thursday — optimize?")

**Q3 refinement — GPT dropped all of the above except ONE for V1: "Schedule Repair."** Repair after disruption, never generate from scratch (preserve the planner's optimized work). Sub-ideas, all **new** and all compatible with our draft/publish + patch model:
- Objective = **minimum-change** repair (constraint optimization): minimize route changes + employee changes + travel increase + overtime + missed visits — *not* shortest distance
- **Triggers:** employee unavailable (banner "Ahmed has 18 affected visits · Repair"), store unavailable ("12 visits affected · Repair?"), or manual "✨ Repair Schedule". Directly targets our §7.3b *Absence (manual by design)* pain point
- Reads only operational data (hours, workload, skills, region, leave, overtime; store frequency/priority/skills/duration/time-windows; route order/travel; hard caps + opening hours)
- **Store business priority** (revenue tier ★→★★★★★ = skippable → must-visit) feeds the repair — **new** (we have category, not an explicit skip-priority)
- Output = **3 repair plans** (Minimal change / Balanced workload / Lowest cost), each with metrics + a **confidence %**
- **Git-style diff review** (green added / red removed / blue modified) — not paragraphs
- **Per-change accept/reject**; rejecting one recomputes only the remaining conflict; bulk Accept All / Reject All / Accept Selected — extends our publish review modal
- **"Why?" explainability** per suggestion (same district, qualified, available, +8 min travel, no overtime, keeps Friday unchanged)
- **Hard vs soft guardrails:** never violate labor law / hours / lunch / store hours / required skills / mandatory visits; may bend soft ones (preferred employee, ideal travel, balance) *with explanation*
- Confidence scoring; low confidence → mandatory review, **never auto-apply**
- **Non-silent learning:** asks reason on rejection; org-specific preferences improve over time
- Accepted plan lands in **Draft** → planner can still hand-edit → only then Publish. AI = assistant, not autonomous dispatcher — **have** (fits our gate exactly)
- **Naming:** call it "Schedule Repair," not "AI Assistant" — name it after the job ("Ahmed called in sick, fix today in 5 min")

### Change management & publish
- Draft mode; everything edited in draft until published — **have**
- Publish flow: review change summary → preview impacted employees → choose notification timing → publish — **partly have** (we group by agent/day; **notification-timing choice** and **impacted-employee preview** are new-ish)
- Base / Override / Actual layers; overrides expire automatically — **have**
- Easy rollback / safe experimentation — **have**
- Frame intent as "changing next Thursday" vs "changing the standard plan" — never expose "layers" as a concept — **have** (yama vs Baz)
- Post-drop floating action card asking *how long the change lives* (not what happened) — **have** (we use a toast + scope prompt; a floating radio card is a UI variation)
- **Custom date-range** override, not just this-week / permanent — **new** (we only do this-week or permanent)
- "Make permanent" shows an **impact count** ("138 affected visits", which months) before confirming — **new**
- **Smart contextual default** for the change window: current week → this-week; far-future week → permanent (w/ confirm); active campaign → campaign duration; employee on leave → leave period — **new**
- **Business-event-aware override windows** — offer real options the system already knows instead of generic dates: "Until store reopens (closed until Jul 24)", "During Ahmed's vacation (Jul 13–20)", etc. — **new** (standout idea)
- Per-visit **version timeline** in the inspector: Base 45m → Override 35m → Published → Reverted, with dates — **new**
- Override inspector actions: Edit / Duplicate / **Convert to Permanent** / Delete Override — **partly have** ("Kalıcı yap" = convert; **Duplicate override** is new)
- "Delete Override" framed as business logic, distinct from immediate Undo — **have** ("Baz'a dön" / revert)
- Cascade semantics like CSS: **Actual > Override > Base**, closest rule wins; editing Base does **not** overwrite an existing Override — **verify ours** (our patch lives in current-week `visits`; some base edits regenerate the week — need to confirm patches survive)
- Timeline "Show Overrides" toggle (off → Base only) — **have** (our Efektif/Baz toggle is the equivalent)

### Notifications (mostly **new**)
- Notification center: pending publishes, delivered updates, read receipts, failed deliveries
- Channels: push / SMS / email / in-app
- Tracking states: sent / delivered / read / acknowledged
- Notification-timing control to prevent spam — **partly** (we batch)

**Publish → field (Q6). GPT reframed Publish from a button to the core handoff. Publish answers 4 questions: what changed · who's affected · when should they know · how do we know they got it.**
- **Publish Review drawer** (slides from right, never leave page) with headline counts: draft changes, affected workers, blocking errors, warnings — **have** (we have a review modal; drawer is a variation, and the tiered error/warning counts tie to Q5)
- **Group changes by person, not by record** ("Ahmed · 12 changes"), expand to a Git-style diff with a reason per change — **have** (we group by agent/day with per-item revert)
- **Notification timing options:** Send immediately (emergencies) · Send today 18:00 (batch, recommended) · At start of shift (30 min before) — **partly** (we batch within a settings window; explicit timing choice is new)
- **Smart timing default by when the change applies:** today's route → immediate · tomorrow → before shift · next week → end of day; planner can override — **new**
- **Message preview** — planner sees exactly what the worker will receive before sending — **new**
- **Worker-facing messages are specific**, never "your schedule changed": "Thursday · 3 changes · Start 09:30 (+30m) · Carrefour removed · Şok added" — **new** (field-side, mostly out of our planner scope but shapes the payload)
- **Mobile: changed visits glow blue**, clear after first view — **new** (field-side)
- **Acknowledge** step ("✓ I've seen the new schedule" ≠ "I completed it") — **new**
- **Delivery/Read/Acknowledged tracking** per worker in a live Notification Center; shows where comms broke down; offline → "Pending Delivery", auto-updates on reconnect — **new**
- **Escalation on non-acknowledgment** (e.g. 30 min before shift) → Call / Resend / Notify Supervisor — **partly** (our design mentions inbox escalation; this is richer)
- **Publish versioning** — every publish is a version; worker always gets the newest only (never v1 after v3) — **new**
- **Publish History / audit** — who / when / reason / affected workers / ack status per version — **partly** (we keep a change log / audit trail; per-publish version records are new)
- **Closed-loop "Understood" 4th state (standout):** beyond Read/Acknowledged, worker taps "✓ Schedule understood" OR "❓ I have a problem" → pick a reason (can't reach store on time · vehicle issue · already elsewhere · need supervisor review · other). Planner learns whether the worker believes they can *execute*, not just that they read it — **new** (and it **feeds back into Q3 Schedule Repair**: an "I have a problem" is a disruption)

### Data / entity model
- Store, Merchandiser, Route, Visit, Task Template, Campaign, Override, Notification — **have** (matches ours)
- Employee attributes GPT adds: working hours, **skills**, availability/leave, KPIs — **new** (skills, explicit leave, KPI store)
- Route stats: total duration, distance, assigned employee — **partly** (distance is new)
- Campaign fields: name, targets, filters, date range, **priority**, tasks, notification options — **partly** (priority + notification options new)

### Entity modals (GPT's tab designs — reference for our panels)
- Store modal tabs: Overview, Schedule, Tasks, History, Photos, Notes, Exceptions — we have Info/Tasks/History; **Photos** tab is new
- Employee modal tabs: Calendar, Workload, Route, Leave, Performance, Messages — **partly new** (Leave, Performance, Messages)
- Route modal: Map, Timeline, Store order, Total travel, Total duration; actions Optimize / Balance / Reassign / Duplicate — **partly new**
- Campaign modal preview: # affected stores, estimated extra work, employees impacted — **partly** (we show target count; **estimated extra work** + **employees impacted** are new)

### Monitoring & analytics
- Plan health at a glance: workload %, route health, warning badges — **have**
- Weekly utilization, travel time, overtime prediction — **partly new** (travel, overtime prediction)
- Heatmaps for underserved regions — **new**
- Gamified workload fairness score — **new** (we have a fairness bar, not gamified)

### Future / moonshots
- Live collaboration (multi-planner) — **new**
- AI-generated monthly plans — **new**
- Predictive staffing ("can we add a person in region X?") — **partly** (we answer this manually)
- Offline editing — **new**
- "What-if" simulation mode — **partly** (we have a whatif button stub)

---

## Per-question notes

### Q1 — Density at scale (answered)

**GPT's answer (summary).** Opens to the 3-pane weekly workspace. Progressive disclosure: only route names listed, one route expands at a time, only the selected week renders, virtualized list + timeline. Center = people × weekdays; blocks show store + duration + status color. Walkthrough to shorten Migros Bornova Thu 45→35: Ctrl+F → "Migros Bor" → Enter (auto-expands route, scrolls to Thursday, outlines block, inspector loads store) → click "45" → "35" → Enter. Downstream shifts, travel/lunch/total recalc, Publish +1, min-visit-time warning w/ override, AI notes 15 min freed. ~8s, no modal/navigation.

**Notes.**
- *Validates our architecture* — GPT walked the exact search → focus → inspector → inline edit → draft → publish flow we already have.
- *Blind spot* — GPT only solved the "I know the store's name → search for it" path (the easy half of density). The hard half — **triage: which of 400 stores is a problem when you don't know the name** (under-serviced, over cap, missing this week, unbalanced) — it didn't address; leaned on "progressive disclosure + virtualization." We already handle triage (region/filter, fairness bar, over/under day coloring, status warnings).
- Ideas it surfaced are logged in the inventory above (keyboard search, scroll-to-block, inline duration edit, travel time, min-visit blocking, AI nudge).

### Q2 — Temporary vs. permanent (answered)

**GPT's answer (summary).** Reframed from data model to UX around one principle: *dragging should never interrupt; infer intent, confirm only when ambiguous.* Don't expose "layers" — the planner thinks "I'm changing next Thursday" or "the standard plan," and the software maps that to Base/Override. After a drag-drop, a small floating action card (not a modal) asks *how long the change should live*: This week only (default) / Permanent / Custom range. Default is temporary because ~80–90% of edits are operational exceptions; permanent-as-default would silently rewrite future months. Permanent shows an impact warning ("138 affected visits", which months). Visual language: Base = normal card; Override = blue left border + "Week Override" label + hover shows date range; Permanent = no badge (it's now reality). A "Show Overrides" timeline filter hides/shows overrides. Inspector shows Origin + Applies range + actions Edit / Duplicate / Convert to Permanent / Delete Override. Reverting = "Delete Override" (business logic), distinct from immediate Undo. Cascade like CSS — Actual > Override > Base, closest wins; editing Base doesn't overwrite a live Override. Adds a per-visit Version Timeline (Base → Override → Published → Reverted). Smart defaults follow context (current week / far future / campaign / leave). **Best new idea:** a *contextual* window selector offering business events the system already knows — "Until store reopens", "During Ahmed's vacation" — instead of raw dates.

**Notes.**
- *Validates our model deeply* — GPT's "infer intent, confirm only if ambiguous," temporary-by-default, convert-to-permanent, revert-to-base, and Base/Override hide-toggle are all things we already do (drag = yama, "Kalıcı yap", "Baz'a dön", Efektif/Baz).
- *Genuinely better than us in a few spots* (logged in inventory): **business-event-aware override windows** (the standout), **custom date-range** overrides, **impact count** on make-permanent, **smart contextual defaults**, per-visit **version timeline**, and **duplicate override**.
- *Action item for us:* verify our cascade — a patch lives in the current-week `visits` array; some Base edits (e.g. frequency change) regenerate the week from `projectWeek`, which could wipe an existing patch. GPT's "Override wins, Base edits don't clobber it" is the correct rule; worth confirming ours holds.

### Q3 — AI assistant (answered)

**GPT's answer (summary).** Self-corrected: of its original 6–8 AI features, only **one** belongs in V1 — **Schedule Repair**. AI should *repair* schedules after disruptions, never generate from scratch (planners spent weeks optimizing; don't surprise them). Given a disruption, produce the **smallest set of changes** that restores a valid schedule (constraint optimization minimizing route/employee changes + travel + overtime + missed visits). Triggered by employee-unavailable, store-unavailable, or a manual button, each showing the affected-visit count. Reads only operational data; respects store business priority (skippable vs must-visit). Outputs **3 plans** (minimal / balanced / lowest-cost) with confidence %. Review is a **Git-style diff**, every change independently accept/reject (rejecting recomputes only the rest), plus bulk actions. Every suggestion has a "Why?". Hard constraints never violated; soft ones only with explanation. Low confidence → mandatory review, never auto-apply. Learning is non-silent (asks why on rejection). Accepted plan stays in **Draft** until the planner publishes — AI is an assistant, not a dispatcher. Rename from "AI Assistant" to **"Schedule Repair"** — name it after the job.

**Notes.**
- *Good instinct* — narrowing 6→1 and choosing *repair over generate* is exactly right for this domain and for us. It fixes the pain point we deliberately left manual (§7.3b *Absence, manual by design*).
- *Philosophically compatible with our build* — output stays in our draft/publish gate, the per-change accept/reject maps onto our per-item publish-review revert, and hard/soft constraints mirror our "450 warns, some things block" stance.
- *Honest caveat* — this is the **biggest build** of anything proposed (a real constraint solver). In prototype terms it'd be a **mock**: canned repair plans behind the real UX shell (trigger banner → 3 plans → diff review → accept into draft). That shell is very buildable and would sell the concept.
- Sub-ideas logged in the AI inventory above.

### Q4 — Travel time & optimization (answered)

**GPT's answer (summary).** Self-corrected again: no route optimization in V1. Make travel a **hard scheduling constraint** — a schedule where the merchandiser can't physically reach the next store in time is invalid and **cannot be published**. Not a soft warning (that ships impossible "fake schedules"); not full optimization (changing one store shouldn't reshuffle twenty — planners want predictability). Travel is nearly invisible: a one-line connector (🚗 12m) between visits, hover to expand. Impossible travel → "⚠ Impossible · Missing 15 min" + red borders on both cards. Live ghost feedback while dragging (needed vs available); invalid drop → "Needs +4 min" → one-click **Auto Fix** that shifts only downstream visits. Inspector carries Travel From/To details out of the main timeline. V1 optimization is just **"Optimize Gap"** (right-click between two visits; only swaps the next two, shifts downstream, or suggests a closer already-assigned store). Full-day **"Optimize Thursday"** is V2, opt-in, never automatic. New addition: **"Travel Confidence"** (high/medium/low) with an auto-reserved buffer for low-confidence segments.

**Notes.**
- *Consistent instinct with Q3* — predictability over optimality, repair/fix-what's-broken over recompute-the-world. Same philosophy; good sign of a coherent product mind.
- *The one real tension with us* — travel-impossible as a **hard block**. It's a divergence from our "warn, never block," but a *defensible carve-out*: physical impossibility is a different class than workload preference (450 quota). This is now the **second block-candidate** alongside Q1's min-visit-time — worth deciding together as "what, if anything, is ever allowed to stop a publish?"
- *Buildable in our prototype* — the one-line connector, impossible-travel red state, and **Auto Fix (we already reflow downstream)** all fit our schedule grid, and our stores' `x,y` coords let us fake travel times with no maps API. "Optimize Gap" and "Travel Confidence + buffer" are small, self-contained, and on-brand.
- *Shares machinery with Q3* — "Auto Fix" is a mini Schedule Repair; a travel-feasibility check is a constraint the repair engine would also use.

### Q5 — Conflict detection (answered)

**GPT's answer (summary).** Model it like a compiler: every rule has a severity and the UI behaves consistently by it. Three tiers — 🔴 Error (blocks publish), 🟡 Warning (allowed but suboptimal), 🔵 Info (worth a look). Hard errors: visit overlap, impossible travel, store closed, employee unavailable, daily-hours exceeded, required task missing, skill unmet. Warnings: long travel, workload imbalance, high-value store late, frequent changes, idle gap, too many consecutive large stores. Live validation touches only the affected employee+day, never the whole week. Anti-clutter rules: one visual status per card (no stacking), day-header problem counts (🔴2 🟡4), route-tree summaries, and a dedicated **Conflict Center** that lists all problems grouped by severity and jumps-to-highlight on click. Every error has **Auto Fix**. Publish Review shows "4 blocking · 9 recommendations" — publishable past warnings, never past errors. Biggest idea: **scope-based placement** — each issue appears at its smallest meaningful scope (visit card / connector / day header / employee name / route tree / publish review).

**Notes.**
- *This is the keystone answer.* It **resolves the "what blocks publish?" question** I flagged across Q1 and Q4: adopt a severity tier where a specific, defensible set of *impossibilities/illegalities* block (overlap, travel, hours, closed, unavailable, skill, missing mandatory task) and everything else warns. Three scattered divergences → one coherent, principled policy. Still a change from our current "never block," but now with a clear, non-arbitrary boundary.
- *It also fills Q1's blind spot.* The **Conflict Center** (grouped problem list → click to jump/highlight) is exactly the triage tool Q1 was missing — you don't hunt a 400-store calendar, the problems come to you.
- *Best IA idea in the whole brainstorm:* **scope-based placement.** It's the principled cure for "Christmas-lights" clutter and it's what makes conflict surfacing scale.
- *vs us:* we have an informal 2-level status bar + day-total coloring + fairness bar. We lack the formal severity system, per-visit status, day/route problem counts, the Conflict Center, scope placement, Auto Fix, and blocking. Lots here is layering over things we partly have — adoptable incrementally.

### Q6 — Publish → field (answered)

**GPT's answer (summary).** Publish isn't a button, it's the planning→execution handoff — if it fails, the field team loses trust. It should answer four questions before anything is sent: what changed, who's affected, when should they know, how do we know they received it. Flow: click Publish → a **Review drawer** slides from the right (never leave the page) with headline counts → changes **grouped by person** (not 34 records), each expandable to a Git-style diff with a reason → **notification timing** (immediate / today 18:00 / start of shift) with a smart default based on when the change applies → **message preview** of exactly what the worker gets. Workers receive specific-impact messages (not "schedule changed"); changed visits glow blue on mobile; they **Acknowledge** ("seen" ≠ "done"). Planner sees live **Delivered/Read/Acknowledged** tracking, offline "Pending Delivery" auto-resolving on reconnect, and **escalation** (Call/Resend/Notify Supervisor) if unacknowledged near shift. Every publish is a **version** (worker always gets the newest), with a **Publish History** audit. Biggest addition: a **fourth state — "Understood"** — the worker taps "✓ Schedule understood" or "❓ I have a problem" (+reason), closing the loop so the planner knows whether the schedule is *executable*, not just read.

**Notes.**
- *Right instinct* — treating publish as the trust-critical handoff, not a button. The 4-question frame (what/who/when/how-received) is a clean spine.
- *We already have the front half* — review + group-by-agent + per-item revert + batched notify. The **net-new half is the communication loop:** timing options with smart defaults, message preview, delivery/read/ack tracking, escalation, publish versioning + history, and the "Understood / I have a problem" closed loop.
- *Best full-circle idea* — "❓ I have a problem → reason" is itself a **disruption that feeds Q3 Schedule Repair.** That closes the whole product loop.
- *Scope caveat* — the mobile/receipt side is beyond our planner-only prototype, but every planner-side piece (timing, preview, tracking center, versioning, history, escalation) is adoptable.

---

## Brainstorm complete — how the 6 answers connect

All six questions answered. The striking thing is how GPT's answers **form one coherent system**, not six separate features:

**Detect (Q5) → Repair (Q3) → Publish with a tiered gate (Q5) → Communicate + confirm executability (Q6) → problems flow back to Repair (Q3).**

- **Q5's severity model is the backbone** — it defines what's an error (blocks) vs. warning, which the publish gate (Q6) enforces and the repair engine (Q3) respects as hard/soft constraints.
- **Travel feasibility (Q4)** is one rule in that severity set; **Auto Fix (Q4)** is a mini Schedule Repair (Q3).
- **The "I have a problem" reply (Q6)** is a disruption that triggers Repair (Q3).
- **Temporary/permanent (Q2)** governs how any of these edits are scoped in time.
- Recurring product instincts across all six: *predictability over optimization, repair over regenerate, name features after the job, never auto-apply, keep everything in draft until an explicit publish.* These align almost perfectly with our existing draft/publish + patch architecture.

**Where GPT genuinely extends us (shortlist for a decide-later triage):**
1. Severity tiers + a hard block-list (resolves Q1/Q4/Q5) — a policy decision vs. our "never block."
2. Conflict Center + scope-based placement — the triage/density answer.
3. Schedule Repair (mock-able shell) — automates the pain point we left manual.
4. Business-event-aware override windows + smart contextual defaults (Q2).
5. The publish communication loop: timing defaults, tracking, and the "Understood / I have a problem" state (Q6).
6. Cheap wins from Q1: keyboard search, scroll-to-block, inline duration edit.

---

## Round 2 — gap-probing questions

Round 1 covered the scheduling → disruption → publish loop. Round 2 probes the regions GPT never touched (task management, analytics, cold start) plus robustness holes, cross-referenced against our design doc §10 "Open questions."

| # | Question | Status |
|---|---|---|
| Q7 | Task management — catalog × store-type × exceptions on one page, live time impact | **answered** |
| Q8 | Proving value — weave planned-vs-actual / photos / reports into planning, not a separate BI export | **answered** |
| Q9 | Cold start — empty board, 400 unassigned stores → first monthly plan | **answered** |
| Q10 | When repair is impossible — no feasible solution, help the planner decide what to sacrifice | **answered** |
| Q11 | Concurrent editing — two supervisors, same week (also our own open meeting question) | **answered** |
| Q13 | Self-critique — the single biggest reason a real company rejects this in a pilot | **answered** |
| bonus | Recurring/monthly reasoning + holidays (Ramadan/bayram bulk shifts) | pending |

### Q7 — Task management (answered)

**GPT's answer (summary).** Its own biggest self-correction: *tasks are not a store property, they're a rule system.* Hierarchy Catalog → Type Rules → Route/Store Exceptions → Visit Template → Scheduled Visit, resolved CSS-style (closest rule wins). Planner almost never edits a visit directly. **Flow A (change a store type):** select the type → inspector shows its Visit Template → Edit Task Template → +Add "Competitor Price 8m" → total 35→43m, still Draft → **Impact Preview** ("147 stores · 18 routes · 642 future visits · +86h/week") → every future visit updates live and the scheduler surfaces new overtime. **Flow B (one-store exception):** select store → inspector shows "Uses Large Migros Template" → Customize shows *inheritance* (inherited ✓ vs override) → disable Expiry → blue "Store Override" badge → 43→38m, downstream shifts live. Route-level exceptions work the same. Signature idea: a **Rule Inspector** (like browser dev-tools) showing *why each task exists* — source per task, what disabled it, and the arithmetic (35 base +8 −5 = 38). Answers the real question planners ask: "why is *this* store different?"

**Notes.**
- **Third convergence on our own architecture.** This is exactly our design: tasks-as-rules with a scope ladder (store > route > format > chain > global), `resolveTaskMin` already returns a source label per duration ("kural: tip / rut / bu mağaza"), and the Yönetim page already has the görev × store-type matrix + exceptions list. GPT independently rebuilt it — strong validation that our model is right. (It's also the **3rd time GPT reaches for a CSS-cascade / closest-rule-wins metaphor** — Q2 overrides, Q7 tasks — which is the exact spine we use.)
- *Where it sharpens us (all adoptable):*
  - **Rule Inspector** — a consolidated dev-tools-style per-visit breakdown (each task + its source + disabled-by + additive math). We show a source label today but not the full provenance chain in one place — **partly have → upgrade**
  - **Aggregate Impact Preview** on a rule change ("147 stores · 642 visits · +86h/week" + which employees tip into overtime) — we log changes but don't preview the *ripple* at this scale — **new** (generalizes Q2's impact count)
  - **Explicit inheritance UI** ("Uses X Template" + inherited vs override toggles) — cleaner than our current source labels — **partly have → upgrade**
  - **Live operational-cost surfacing** (task change → immediate overtime on affected people) — **partly** (we regenerate; we don't headline the cost)
- *Takeaway:* Q7 aimed at a suspected gap and instead confirmed we're **strong** here — the win is two concrete UI upgrades (Rule Inspector, Impact Preview), not an architecture change.

### Q8 — Proving value (answered) — *the first genuinely new territory*

**GPT's answer (summary).** Its sharpest self-critique: *"I designed a planning tool; the brief asks for a business-value tool."* The planner isn't scheduling people, they're **allocating investment** — every visit costs salary + travel + time + opportunity cost, so every visit should answer three questions: *Should we go? How much should we invest? Did it pay off?* Design moves, all kept in the planning workspace (no separate BI dashboard):
- **Value Strip** on each visit card — tiny (▲ Sales +12%, ★★★★☆ "Good ROI"), not a chart
- **Store Performance** in the inspector — visit compliance %, average *actual* minutes, sales trend, shelf score, price-collection %
- **Evidence, not just sales** — before/after shelf score (72→91), facings (12→18), sales +12% over 8 weeks
- **Before/After photos brought into *planning*** (not just execution) — hover preview, click for full
- **Decision support** — two stores need more time; evidence (shelf/sales) shows which deserves it; increasing 45→60 shows "Investment +15 min/week · History suggests High ROI" (historical, not AI)
- **Left store list gets health stars** (Route A ★★★★★; expand → per-store)
- **Dynamic impact** — removing a visit shows "Average Coverage −18% · Historical Sales −6% · Confidence Medium"
- **Weekly Health Heatmap** strip above the timeline (🟢🟢🟡🟢🔴), click to jump — navigation aid, not dashboard
- **Visits get a *Purpose*, not just a duration** ("Recover Shelf Quality", "Price Monitoring", "Promotion Audit")
- **"Planning Evidence" panel** — answers "if I spend another minute here, what does history suggest I get back?": current plan, compliance, actual, shelf-quality trend, sales trend, pricing/display compliance, before/after thumbnails, a recommendation + confidence
- **Causality honesty (the mature part):** does *not* claim the merchandiser caused +12% sales. Surfaces the **evidence chain** instead — Planned work → Actual execution → Shelf condition → Operational metrics → Sales trend — credible without overclaiming attribution

**Notes.**
- *First real extension.* Round 1 and Q7 kept validating us; **Q8 is the first place GPT genuinely goes beyond our design.** We kept analytics as downstream accountability (§8) with an anti-mobbing stance; we never wove **value-evidence into the planning surface itself** to support investment decisions. This directly serves the brief's stated purpose, which we underserved.
- *Aligns with our own ethics.* GPT's "don't claim attribution, show the evidence chain" **rhymes with our §8 anti-mobbing principle** ("awareness layer, not a discipline engine"). Both are about being honest with the data and not weaponizing/overclaiming it — a shared value we could state explicitly.
- *All new for us, all adoptable, all single-page-friendly:* Value Strip, Store Performance inspector, Planning Evidence panel, Purpose-per-visit, health stars, weekly heatmap, before/after in planning, remove-visit impact, evidence-chain framing.
- *Caveat 1 — data dependency.* This needs real execution data flowing back (compliance, shelf scores, sales trends, photos). Prototype = mockable with fake metrics; real build needs the execution/reporting pipeline.
- *Caveat 2 — surface, don't prescribe.* Its early example ("Store B, shelf 61, sales −4, deserves more attention") quietly prescribes an allocation heuristic (invest in strugglers vs. protect winners) — a genuine judgment call. The **Planning Evidence panel gets it right** (surfaces + recommends + shows confidence); keep it in that mode, not auto-deciding.
- *Best single idea:* **Purpose-per-visit + the evidence chain.** Reframing a visit from "45 min" to "45 min · Purpose: Recover Shelf Quality → here's the evidence it's working" is the cleanest expression of the whole brief.

### Q9 — Cold start (answered) — *the most structural insight of the exercise*

**GPT's answer (summary).** Reframes the whole product: there are **two modes that shouldn't share one UI** — *Setup Mode* (run once / a few times a year) and *Operations Mode* (daily). Day 1 opens a **guided workspace, not an empty calendar** ("We found 400 stores, 15 merchandisers, no plan — let's build your first monthly plan"). Flow: (1) **Data-quality check first** — surface missing coordinates / unknown sizes / missing revenue before planning; (2) **Confirm workforce** — hours/days pre-filled, no repetitive entry; (3) **Generate First Draft** — the *initial-assignment* AI (heuristics: geography, type, frequency, duration, home region, hours) → e.g. 20 routes, 15 assigned, 94% avg workload; (4) **Review, not build** — approve suggested routes (Route A · 22 stores · Ahmed · 96% confidence · Accept/Edit), which *flips the workload from constructing to reviewing*; (5) enter the familiar operations workspace, now pre-populated. Assumes ~80% of suggestions accepted, 20% adjusted; every route carries a "why?" + confidence; overloaded routes get one-click suggested fixes. Manual placement is dismissed with math (400 × 10s ≈ 66 min just to place, no validation). **Biggest idea: restructure the product around two engines** — a **Planning Engine** (*creates*: initial plan, monthly regeneration, big reorganizations — "Generate", runs rarely) and an **Operations Engine** (*maintains*: leave, closures, campaigns, overrides, repair, publish — "Maintain", runs daily).

**Notes.**
- *Second genuine extension, and the deepest.* Our entire design **and the whole prototype are Operations Mode** — we seeded an existing plan and never designed cold start. Q9 says that's not "a harder empty version of the same screen," it's a **different guided flow** (data check → confirm workforce → generate → review → fix exceptions → publish). We have single-route creation (§7.1 draft wizard); we have no bulk bootstrap.
- *It resolves the apparent Q3 contradiction.* Q3 said "AI should repair, not generate." Q9 ships generation as the first AI feature. Not a contradiction — the **two-engine model reconciles it:** *generate when there's nothing to preserve (setup), repair when there's optimized work to protect (operations).* Coherent.
- *All new for us, all adoptable:* guided Setup Mode, the **data-quality check** screen, **bulk initial auto-assignment** ("Generate First Draft"), **review-not-build** approval flow, per-route explanation + confidence, progressive-commitment onboarding, and the **two-engine product architecture** as a framing device.
- *Buildable note:* the auto-assignment heuristic is real work but simpler than the repair solver, and our stores already carry `x,y` — a greedy geographic clustering balanced by workload could produce a plausible first draft in the prototype without a real optimizer.
- *One thing to reconcile:* GPT's "monthly regeneration" (a Planning-Engine event) vs. our standing-Baz model (weeks project forward continuously). Need to define when the Planning Engine *re-runs* vs. the standing pattern just projecting — otherwise the two engines could fight over the same weeks.

### Q10 — When repair is impossible (answered) — *the philosophical peak*

**GPT's answer (summary).** Exposes the flaw in every "AI planner": Schedule Repair assumed a solution exists, but real ops has 15 people and work for 18 — no algorithm invents people. At that point the product stops being a planner and becomes a **decision-support system**. Rename the feature **"Coverage Decision"** — we're not optimizing, we're deciding what the business is willing to lose. Flow: (1) **Detect infeasibility** — instead of "3 solutions found", show "No feasible schedule. Capacity 600h · Required 673h · Shortfall 73h = 1.8 merchandisers" (a staffing problem, not a bug); (2) **Don't ask "fix it," ask "where do you want to spend the shortage?"** — a Tradeoff Panel of *business objectives*, not algorithms: Protect revenue / Protect compliance / Protect employees / Custom (sliders for overtime vs missed visits vs revenue risk, live update); (3) the **Sacrifice Board** (signature) — a *ranked list of visits at risk* with revenue tier, last-visit, impact, and a recommendation (Skip / Keep / Move), each with a "Why?"; (4) **not binary** — offer alternatives per visit (skip / reduce 45→25 / move to Friday / overtime / temp contractor); (5) **visualize as amber** at-risk states, only for the chosen strategy; (6) **business impact as *risk, not false precision*** ("Coverage 96%→91% · Revenue Exposure Medium", never "you'll lose $4,000"); (7) **Publish review becomes "Business Decisions"** (12 deferred · 6 reduced · 8 overtime · risk medium) — auditable; (8) **Escalation** when even sacrifice fails (request temp staff / approve overtime / reduce frequency / escalate to Regional Manager) — "planning stops, management starts; the software knows its limits." **Biggest change: redefine the AI's goal** — not "produce the best schedule" but **"produce the best *explanation of the tradeoffs*"** — with a **Decision Matrix** (Decision × Coverage × Revenue Risk × Employee Cost) replacing "Plan A/B/C".

**Notes.**
- *The intellectual peak of the whole exercise.* It's an extension of Q3 (Schedule Repair), not a new gap — but it fixes Q3's hidden assumption and reframes the AI's entire purpose. At genuine scarcity the tool doesn't pretend to solve; it makes the compromise **explicit, measurable, defensible** and hands the decision to the human/management.
- *Retroactively strengthens Q3:* Schedule Repair should *always* be tradeoff-first; Coverage Decision is just the extreme where the tradeoff is pure loss. Same engine, honest framing.
- *Ethical alignment with us:* "expose risk, not false precision" is the same intellectual honesty as Q8's causality chain and our own §8 anti-mobbing stance. Consistent value across the product.
- *All new for us:* infeasibility detection + shortfall quantification, the strategy/tradeoff panel, the Sacrifice Board, business-impact-as-risk, escalation-to-management, and the Decision-Matrix review. We handle absence manually today and have no scarcity tooling.
- *Buildability:* top of the complexity stack (multi-objective optimization underneath), but the **valuable part is the framing/UX**, which is fully mockable in the prototype over faked numbers.

### Q11 — Concurrent editing (answered) — *the most technically rigorous, and it answers our own open question*

**GPT's answer (summary).** Treats it as a distributed-systems problem and redefines Draft. Model: **three states — one Published Plan (shared truth) + a per-user Personal Draft** (Amir's, Sarah's). No one edits Published directly; everyone edits their own private draft — solves ~80% of concurrency by construction. Layer on: **presence** indicators (who's editing, non-intrusive); **soft locks, not hard** (selecting a visit tints it + "✏ Sarah is editing", but you can still edit — hard locks strand everyone when someone goes to lunch); **optimistic concurrency control** at publish — a draft is "based on Published v18"; publishing checks the server version; unchanged → applies and bumps to v19; changed → "Conflict detected: base version changed" (not "publish failed"); **GitHub-style conflict review** (Keep Published / Use Mine / Merge Manually); **field-level auto-merge** — different fields of the same object merge automatically (Amir edits duration, Sarah edits note → both kept), only same-field-same-object stops for a decision; **field-team isolation** — only Published ever reaches workers, drafts never leave the planner; **atomic publish queue** (each publish Applied or Needs-Merge, never partial); crash-safe draft mini-history. **Biggest change: redefine Draft** from "a list of unpublished changes" to **"a versioned workspace with optimistic concurrency control"** — each draft stores Draft ID · based-on published version · author · timestamp · changed objects · changed *fields* — which is what enables field-level merge instead of document/route/week locking.

**Notes.**
- *Answers our own §10 open question* (the Turkish "Eşzamanlı düzenleme" item we flagged to raise with the client). It's not a product gap we missed so much as a question we deliberately deferred — and GPT gives a textbook-correct answer.
- *Reframes a core primitive (for the real build).* Our Draft today is a single shared change-list (`changes[]`) + `logChange` → Yayınla, plus a single `adminDraft`. GPT's per-user branch + OCC + field-level merge is the multi-planner version. That's a **backend/architecture upgrade (§5/§9), not a prototype change** — our prototype is single-user, so this is mostly captured for the real system.
- *Consistent architectural taste:* this is the **third time GPT redefines a core primitive as versioned with latest/closest-wins semantics** — Q2 override cascade, Q7 task cascade, Q11 draft-as-OCC-workspace. And it **builds cleanly on Q6** (every publish is a version) — the version number Q6 introduced is exactly the OCC base-version Q11 checks. Coherent across answers.
- *Requirement it implies:* field-level merge needs the data model to track *changed fields per object*, finer-grained than our current change-log. Worth noting for §5/§9 if we ever go multi-planner.

### Q13 — Self-critique (answered) — *the strongest strategic answer; new gaps*

**GPT's answer (summary).** The pilot-killer isn't AI, performance, or the single-page architecture — it's that GPT **designed for planners and under-designed for organizational politics.** Failure mode: six weeks in, the planner loves it (6h→2h), then the Sales Director asks "why did Store 143 get only one visit?" and "the system recommended it" is an unacceptable answer — the pilot goes political. The real customer isn't the planner; it's a web of contested stakeholders (Sales wants every VIP visited, Operations wants less overtime, Finance wants less travel, Marketing wants promotions everywhere) and **the software becomes the referee.** What enterprises need isn't optimization, it's **Decision Accountability** — every important decision answers Who / What / When / **Why**, defensible in a meeting ("Visit removed · Amir · reason: coverage shortage · strategy: Protect Revenue · approved by Regional Manager · Jul 12 14:33"). Two things it says it missed: (1) rules aren't centralized — a company may have 50 local policies (Region A lunch 30m, Region B 45m, "never skip pharmacies," "always visit Carrefour"), so the product needs a **policy-governance layer above planning** (Corporate → Regional → Route → Store → Visit, inherited like CSS/Kubernetes), not just an exception engine; (2) the one feature it completely missed — a **Decision Journal** (not an activity log): coverage shortage → decision → reason → approved-by → impact, so months later everyone knows *why* the plan looked that way. Biggest shift: the product isn't "planning," it's **operational decision-making** (why decided · who approved · what alternatives · which objective · what happened after). Final humility: it repeatedly **assumed planners think in timelines** — a company that's used Excel for 15 years may think in stores/territories/lists, so the first pilot should validate *that assumption* via discovery ("what screen is open 80% of the day?"), not validate the software.

**Notes.**
- *Best strategic answer of the 13.* Correctly locates the real risk in **trust and politics, not technology** — and it names three genuine gaps for *us*, not just for its own design:
  1. **Decision accountability / Decision Journal** — we have audit logs (RouteChangeLog, adminLog: kim/ne/ne zaman) and reason codes on reassignment, but **not** the full rationale + business-objective + approval-chain + alternatives-considered record. Real extension.
  2. **Multi-stakeholder reality** — our design has exactly **two roles** (Supervisor + Field agent). Real orgs have Sales/Marketing/Finance/Regional pulling in contradictory directions, and the plan is politically contested. We never designed for stakeholder visibility or approvals. Genuine gap.
  3. **Policy-governance layer** — our scope ladder (store>route>format>chain>global) is rule *inheritance*, but not policy *governance* (ownership, approval, "who set this and can defend it"). Partial for us; the governance dimension is missing.
- *Extends the through-line to its endpoint.* The pattern was "surface the tradeoff, don't auto-decide." Q13 pushes it one step further: **make every decision accountable and defensible to the whole organization**, not just explained to the planner. "AI decided" is unacceptable; "Amir decided, to protect revenue, approved by the Regional Manager, here are the alternatives" is defensible. Unifies with our own §8 accountability/anti-mobbing stance and Q10's "explicit, measurable, defensible."
- *Where we're already hedged:* GPT's final worry — "do planners even think in timelines?" — is a risk **our design partly mitigates**. We ship three coexisting views (map / schedule / table) plus a full **table mode**, so a planner who thinks in lists uses the table, geography uses the map, time uses the calendar. We're less exposed to the timeline-assumption than GPT's timeline-centric design. Worth stating as a deliberate strength.
- *Actionable meta-lesson:* the first pilot should validate **assumptions about how planners think**, not the software. Cheap discovery (observe real planners for a few days) de-risks more than any feature.

---

## The through-line GPT keeps returning to

Across every answer where GPT genuinely extended us, it's **the same principle**: *surface the ripple / evidence / tradeoff before committing — don't auto-decide.*
- Q2 impact count · Q5 Conflict Center · Q7 Rule Inspector + Impact Preview · Q8 evidence chain · Q10 Decision Matrix.
- Stated most sharply at Q10: **"the AI should produce the best explanation of the tradeoffs, not the best schedule."**
- It pairs with a consistent ethic — *predictability over optimization, never auto-apply, expose risk not false precision, keep everything in draft until an explicit publish* — which aligns almost perfectly with our draft/publish + patch architecture and our anti-mobbing stance. **This is the candidate "product principle" to adopt explicitly.**

---

## Final conclusion (all 13 questions answered)

**GPT validated our core and found our real blind spots.** Across the scheduling → disruption → publish loop (Q1–Q6), the task model (Q7), and concurrency (Q11), it independently re-derived our architecture — three panes, base/override cascade, task-as-rules cascade, draft-before-publish, patch/temporary model. That convergence is the headline: **our operations-mode architecture is sound.**

**The genuine gaps it exposed cluster into three themes — all things our prototype quietly assumes away:**
1. **Proving value (Q8)** — we treat analytics as downstream accountability; GPT weaves value-evidence into the planning surface itself (Value Strip, Planning Evidence panel, Purpose-per-visit, evidence chain). This *is* the brief's stated purpose.
2. **Bootstrapping / setup mode (Q9)** — our whole design is Operations Mode; we assume a plan exists. GPT's two-engine framing (Planning Engine *creates*, Operations Engine *maintains*) + a guided cold-start (data check → generate → review-not-build) is the missing half.
3. **Organizational accountability (Q13)** — we designed for 2 roles and "how to edit"; the pilot-killer is politics and trust. Decision Journal, decision-accountability (who/why/approved/alternatives), stakeholder reality, and a policy-governance layer above the rule engine.

**One unifying principle to adopt:** *surface the tradeoff/evidence and make every decision defensible — never auto-decide.* It runs through every genuine extension (Q2 impact count, Q5 Conflict Center, Q7 Rule Inspector, Q8 evidence chain, Q10 Decision Matrix, Q13 Decision Journal) and it fits our draft/publish + anti-mobbing DNA.

**Robustness upgrades to our existing features:** severity-tiered validation with a hard block-list (Q5, resolves the Q1/Q4 "what blocks publish?"), Coverage Decision for infeasible repair (Q10), travel as a hard constraint (Q4), and Draft-as-versioned-OCC-workspace for multi-planner (Q11).

**Where we're already ahead:** three coexisting views + table mode hedge GPT's biggest worry (that planners may not think in timelines); our patch/Baz cascade already implements what GPT kept re-deriving; our publish gate + audit trail are the spine its accountability ideas bolt onto.

*Next artifact: a value-vs-effort triage — what goes into a prototype v0.5, what's real-build-only, what we skip.*

### Q6 — Publish → field
*(pending)*

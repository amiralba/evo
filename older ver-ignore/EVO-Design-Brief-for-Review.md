# Merchandising Route Planning Tool — Design Brief

## Purpose of this document

We are building a web tool for planning and managing the work of field **merchandisers** (people who service product shelves in retail stores). We would like you to propose a design for it — from a completely fresh perspective. This brief describes the **problem and the requirements only**. It deliberately does **not** describe any particular interface, layout, data model, or workflow, because we want your independent take. Please design it as you think best.

The **one and only constraint we are imposing** is this: the whole planning experience should live on **a single page** — the planner should not have to navigate away to separate pages/screens to get their work done. Everything else is open.

---

## Background: what merchandisers do

A merchandiser is a field worker assigned to visit a set of retail stores on a repeating schedule and perform in-store work so that a brand's products are well presented. A typical lifecycle has four phases:

**1. Route planning & assignment.** A manager assigns each merchandiser a set of stores to visit. A monthly plan specifies which stores, how often each is visited (some daily, some weekly, some every two weeks), and how many minutes should be spent at each. These plans mostly repeat month to month but must be adjusted on the fly — staff resign, a store temporarily refuses service, a region is closed for an event, someone needs coverage while a colleague is out.

**2. Arrival & check-in.** The merchandiser travels to a store and logs their arrival (via GPS on a handheld/mobile device), marking the official start of work there.

**3. In-store work.** Once checked in, they perform a sequence of tasks: photograph the shelf "before," pull stock from the back and restock/tidy shelves, check product labels and expiry dates, count product "facings," periodically record pricing for their own and competitors' products, complete surveys/questionnaires assigned by management, handle promotional displays, and photograph the shelf "after." Management reviews before/after photos to judge visit quality.

**4. Check-out & reporting.** After finishing, they close out the store and leave. The collected data feeds management reports — planned vs. actual visit times, display reports, pricing reports — and the mobile system also handles the worker's own admin (time-off requests, hours tracking).

**The core problem today:** route planning especially relies on manual data entry and disconnected systems, causing missing data and human error. The goal is a single integrated tool that lets planners design and adjust this work reliably, and proves the value the merchandiser's physical work brings to a store's sales.

---

## Who uses the tool

- **Planners / supervisors** — the primary users of this tool. They design the routes, assign people, set visit frequencies and durations, define the in-store tasks, adjust for disruptions, and monitor execution. They plan at desk (desktop screen).
- **Field merchandisers** — consume the resulting plan on a mobile device (out of scope for this brief, but the plan you design is what they'll ultimately receive). They can also send notes/requests back to planners.

Assume one planner may be responsible for **hundreds of stores across multiple regions**, and that store data (name, chain, location, size/format, category, revenue history) is **synced automatically from a separate sales system** rather than entered by hand.

---

## What the tool must let a planner do

Described as needs, not solutions — how to satisfy them is up to you.

**Assignment & routes**
- Group stores into routes and assign a merchandiser to each route.
- Set, per store, how often it is visited and how many minutes are spent there.
- Maintain a set of stores not yet assigned to anyone, and move stores in and out of routes easily.
- Reassign a merchandiser (resignation, swap, coverage) while keeping the route intact and its history traceable.

**Scheduling**
- Turn "which stores, how often, how long" into an actual time-accurate weekly schedule per person, respecting working hours, breaks, and a daily working-time cap.
- Handle temporary, time-boxed changes (a store closed for two weeks, a one-week trial store, a visit shifted to the afternoon this week) without permanently rewriting the standing plan.
- Browse past and future weeks; past weeks are historical/read-only, future weeks are editable.

**In-store task definition**
- Define the catalog of tasks a merchandiser performs at a store (photos, shelf work, expiry checks, facing counts, price collection, surveys, display logging).
- Tasks and their durations vary by **store type/size** and can have **per-store or per-route exceptions**; the planner needs to manage both the general rules and the exceptions.
- Send occasional **one-off tasks/campaigns** to many stores at once (e.g., "run this survey at all large Migros stores before Friday").

**Change management & communication**
- Any change that affects a field worker's schedule must reliably reach them; the business wants control and clarity over when and how those changes are communicated.
- Planners and field workers need a lightweight way to exchange notes/requests tied to a specific store, visit, or day.

**Monitoring & reporting**
- See whether the plan is healthy (workloads balanced, nobody over the daily cap, good mix of high-value vs. low-value stores).
- Support the downstream reports: planned vs. actual times, pricing, displays, visit quality.

---

## Business rules & constraints to respect

- **Single page** (our one imposed constraint): the planner should accomplish everything without leaving the page for a separate screen.
- **Scale:** hundreds of stores, many routes, multiple regions, several merchandisers.
- **Data source:** store attributes come from an external sync; the tool plans on top of that data, it doesn't create stores by hand (except rare exceptions).
- **Time is exact:** visit durations and daily schedules are minute-level, bounded by work hours, breaks, and a daily cap.
- **Frequency matters:** visits repeat on patterns (daily / weekly / every-two-weeks / specific weekdays).
- **Flexibility is essential:** disruptions are constant (resignations, refusals, closures, coverage), so adjusting an existing plan must be fast and safe.
- **Turkish-market product** (multilingual UI likely; the domain vocabulary is Turkish).

---

## What we are deliberately *not* telling you

We are intentionally leaving open: the screen layout and visual design, how information is organized, what the primary interaction model is, the data/entity model, how changes are staged or published, how removal/lifecycle of routes and stores works, and every other design decision. That's exactly what we'd like you to propose freshly.

---

## Your task

Propose a design for this tool. We're interested in:

1. **Overall concept & information architecture** — how you'd structure a single-page planning tool for this problem.
2. **The primary interaction model** — how a planner actually does the day-to-day work (assigning stores, scheduling, adjusting for disruptions).
3. **Key views/interactions** and how they coexist on one page.
4. **The underlying data/entity model** you'd use.
5. **How you'd handle the hard parts** — scale (hundreds of stores), time-accurate scheduling, temporary vs. permanent changes, task-per-store-type rules, and communicating changes to the field.

Feel free to include sketches, wireframe descriptions, or structured notes. Optimize for a planner who does this all day and values speed, clarity, and safe editing.

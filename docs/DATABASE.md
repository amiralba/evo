# Database Design

<!-- Owned by: architect. Kept current by: coordinator.
     AUTHORITATIVE SCHEMA: EVO-Route-Planning-Design.md §5 (tables, columns, constraints, "why this shape").
     This file records the SQL Server adaptation layer + what's actually migrated. -->

## Engine & conventions
- Engine: SQL Server (version TBD — customer-IT question #5). Design §5 was written for PostgreSQL; see DECISIONS.md 2026-07-15 for the adaptation mapping.
- ORM/Migrations: EF Core migrations (`dotnet ef migrations add`), one migration per spec task
- Naming: snake_case tables/columns (matches design doc); English identifiers

## PostgreSQL → SQL Server mapping (apply when migrating each table)
| Design §5 uses | SQL Server equivalent |
|---|---|
| `geography(Point/MultiPolygon)` + GIST | `geography` type + spatial index |
| `jsonb` + GIN | `nvarchar(max)` + `ISJSON` check; computed columns + index for hot keys (rule.condition) |
| partial unique index | filtered unique index (`WHERE end_date IS NULL` etc.) — supported |
| `text[]` (route.districts) | JSON array or child table (decide in spec 001) |
| enums | tinyint + C# enum, or check-constrained varchar (decide once in spec 001, apply everywhere) |

## Schema status
| Table (design §5) | Migrated | Spec |
|---|---|---|
| store, store_revenue, store_flag, store_type | ☐ | 004-store-sync |
| merchandiser | ☐ | 002-auth-roles |
| route, route_stop | ☐ | M1 |
| assignment, patch, planned_visit | ☐ | M1 |
| route_change_log, admin_audit_log | ☑ (as generic `audit_log`, see below) | 003-error-audit |
| task_template, rule, task_instance | ☐ | M2 |
| note, notification | ☐ | M3 |
| settings | ☐ | M1 |
| agent_location (read-only reuse) | ☐ | M4 |

## audit_log (spec 003 — generic table, replaces route_change_log/admin_audit_log for now)
Design §5 specifies two append-only audit tables, both needing owning entities (Route, Setting)
that don't exist yet. Spec 003 built one generic `audit_log` table instead (see
`docs/DECISIONS.md`, 2026-07-16): `Id`, `ActorId` (nullable — null = system), `OccurredAt`,
`EntityType`, `EntityKey`, `Event`, `BeforeJson`/`AfterJson` (`nvarchar(max)`). Indexes on
`EntityType`, (`EntityType`, `EntityKey`), and `OccurredAt`. Write-only via
`Evo.Api.Audit.IAuditWriter` (no update/delete). Currently written by `UsersController`
(create/activate/deactivate) and `AuthController.change-password`. `route_change_log` and
`admin_audit_log` become typed facade queries over this table once Routes/Settings land — no
schema change needed at that point, just query helpers.

## Non-negotiable constraints (from design §5 — DB-enforced, not app-enforced)
- One active route per store: filtered unique index on `route_stop.store_id WHERE effective_to IS NULL`
- One active assignment per route AND per merchandiser (two filtered unique indexes)
- `audit_log` (backing `route_change_log` / `admin_audit_log`) append-only — enforced by
  `IAuditWriter` exposing no update/delete member
- Dated rows everywhere (`effective_from/to`, `start/end_date`) — history is queries, never snapshot tables
- No delete anywhere: `active` flags only

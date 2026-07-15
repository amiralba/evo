# Plan: Solution Scaffold

## Approach
Monorepo. Backend-first (solution + health endpoint + OpenAPI), then contract pipeline, then panel consuming the generated client, then tokens + CI. Every layer proves the next one's foundation: endpoint → contract → client → UI.

## Contracts touched
- Creates the OpenAPI pipeline itself (docs/API.md "Client generation")
- `GET /api/v1/health` — first inventory entry

## Risks
- SQL Server version unknown → develop on container latest LTS; avoid version-specific features
- IIS deployment path must stay viable → no Linux-only dependencies in backend
- Token extraction from a 3,596-line prototype HTML → extract only what's actually used by the workspace shell (colors/spacing/typography); refine per-component later

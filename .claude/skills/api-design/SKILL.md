---
name: api-design
description: Playbook for designing REST API endpoints and contracts. Use when creating or changing API endpoints, request/response shapes, error formats, or docs/API.md.
---

# API Design

## Process
1. Define the resource and operations needed — nouns for resources, HTTP verbs for actions.
2. Design the contract before any code: URL, method, auth, request body, response body, error cases.
3. Write it into `docs/API.md` using the existing endpoint format.
4. Follow project-wide conventions (base URL, error shape, versioning) already in `docs/API.md`.

## Rules
- Consistent plural resource names: `/users`, `/users/{id}/orders`.
- Every endpoint defines: success response, validation errors (400), auth errors (401/403), not-found (404).
- Use one shared error response shape across the whole API.
- Pagination for any list endpoint that can grow (cursor or limit/offset — match existing choice).
- Never return internal errors or stack traces to clients.
- Breaking change to an existing contract → flag it, don't just do it.

## Checklist
- [ ] Contract written in docs/API.md before implementation
- [ ] All error cases specified
- [ ] Auth requirement stated
- [ ] Backward compatible, or breakage flagged

# Shop Console

A local, single-user harness for AI-assisted auditing and enhancement of a Shopify
store. It pairs a Claude agent loop with the Shopify Admin API under one firm rule:
**reads are broad; writes are narrow and human-gated.**

Inspired by the shape of a Claude-Code harness, but deliberately much smaller — no
git worktrees, no coding-agent plumbing. The one thing a coding harness turns *off*
(autonomous action) is the thing this turns *on*: every write to your live store
passes through a human approval gate.

## Safety model

- **Two independent gates.** (1) The Shopify token scope — Phase 1 runs with
  `read_products` only, so nothing *can* write. (2) An in-app approve/reject step
  on every proposed write, showing old → new diffs.
- **Read broad, write narrow.** Generous read tools; write tools added one
  field-type at a time (product descriptions first).
- **Shop config is advisory.** Policies / shipping / tax / URLs are read-and-recommend,
  never auto-executed.
- **Snapshot before writes.** Affected products are dumped locally before any change.

## Auth

Uses Shopify's **client-credentials grant** (the 2026 Dev Dashboard app model):
the app exchanges `client_id` + `client_secret` for a 24h Admin API access token.
The secret lives only in `.env` (gitignored) and is read server-side — never sent
to the browser or committed. If it leaks, rotate it in the Dev Dashboard.

## Setup

```bash
cp .env.example .env      # fill in SHOPIFY_SHOP_DOMAIN, CLIENT_ID, CLIENT_SECRET
npm install
npm run dev               # http://localhost:8788
```

The home page runs a **connection health check** (`GET /api/health`): it mints a
token, then reads shop identity, product count, granted scopes, and a small product
sample. It expects **read-only** scopes at this phase.

## Status

**Phase 1 (current):** auth + read-only GraphQL client + connection health check.

Planned:
- Phase 2 — Product Audit tab: scan → structured findings → old/new diffs (still read-only).
- Phase 3 — snapshot + a single deterministic, approval-gated write path.
- Phase 4 — Playground chat (Agent SDK loop, `canUseTool` write gate).
- Phase 5 — "new product → auto-draft copy from image".

## Commands

```bash
npm run dev         # dev server on :8788
npm run build       # production build
npm run typecheck   # tsc --noEmit — the check before considering work done
```

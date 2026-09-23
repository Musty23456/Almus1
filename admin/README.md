# ALMUS CHAT — Admin Dashboard

React + TypeScript + Vite. Talks to the real backend admin API (`/api/admin/*`) — no mock data.

## Setup

```bash
cp .env.example .env   # set VITE_API_BASE_URL if not using localhost:4000
npm install
npm run dev
```

## Implemented

- Login (real JWT against `/api/admin/auth/login`)
- Dashboard stats
- Users: search, suspend/ban/reactivate/delete
- Reports queue with status transitions
- Groups list (read-only)
- Audit log viewer
- System settings viewer + editor

## Not yet built (backend already supports these — see docs/API.md)

- Admin account management UI (`GET /admin/admins` is implemented server-side; no screen yet)
- Message-level moderation view (viewing/deleting a specific reported message inline)
- Charts (dashboard currently shows numbers, not graphs)

These are straightforward additions against existing, working endpoints — not missing backend functionality.

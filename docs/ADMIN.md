# Admin Guide

## Creating the first SUPER_ADMIN

Admin accounts are never hard-coded. Run, from `backend/`:

```bash
npm run create-admin
```

You'll be prompted for a name, email, and password (hidden input). This creates a `SUPER_ADMIN`. Run this once per environment (local, staging, production) against that environment's `DATABASE_URL`.

## Roles

| Role | Can do |
|---|---|
| `SUPER_ADMIN` | Everything, including deleting users, changing system settings, and managing other admin accounts |
| `ADMIN` | User management (suspend/ban, not delete), reports, moderation, view audit logs and settings |
| `MODERATOR` | View and act on reports, view users/groups (read-only on user status) |

Every admin endpoint checks the caller's role **server-side** (`backend/src/middleware/authenticate.ts` → `requireAdminRole`) — the dashboard hides buttons the current role can't use, but that's a UX nicety, not the security boundary.

## Creating additional admins

There's no public "create admin" endpoint by design. A `SUPER_ADMIN` creates further admin accounts either by running `npm run create-admin` again (for another `SUPER_ADMIN`), or — if you want `ADMIN`/`MODERATOR` accounts from the dashboard — extend `POST /api/admin/admins` (not yet wired in the starter dashboard; the backend model and RBAC checks are already in place, see `docs/ARCHITECTURE.md`).

## Moderation workflow

1. A user files a report (`POST /api/reports`) — type USER/MESSAGE/GROUP, a reason, optional details.
2. It appears in the admin dashboard's report queue (`GET /api/admin/reports?status=PENDING`).
3. An admin/moderator reviews it and sets status to `INVESTIGATING`, then `RESOLVED` or `REJECTED` (`PATCH /api/admin/reports/:id`).
4. If action is needed, an `ADMIN`/`SUPER_ADMIN` suspends or bans the offending user (`PATCH /api/admin/users/:id/status`).
5. Every one of these actions is written to `AuditLog` automatically — visible at `GET /api/admin/audit-logs`.

## System settings

`GET`/`PATCH /api/admin/settings` store arbitrary key/value config (e.g. `maintenance_mode`, `registration_enabled`, `max_upload_size_mb`, `max_group_members`, `announcement_message`, `min_supported_app_version`). The backend already reads `max_group_members` when creating groups; wire up the others in the relevant controllers the same way as you extend the product.

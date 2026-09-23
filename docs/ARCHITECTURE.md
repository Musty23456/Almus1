# Architecture

## Overview

ALMUS CHAT is a three-tier system:

1. **Mobile app** (Flutter) — talks to the backend over REST for CRUD operations and over a Socket.IO WebSocket connection for real-time events (messages, typing, presence, receipts).
2. **Backend** (Node.js/Express/TypeScript) — owns all business logic and authorization decisions. The mobile app and admin dashboard are both untrusted clients; every permission check (blocking, group admin rights, admin RBAC) is enforced here, never assumed from client state.
3. **Admin dashboard** (React/Vite) — a separate authenticated web client for moderation and operations, talking to the same backend under `/api/admin/*`, protected by its own JWT and role checks.

Data is stored in **PostgreSQL**, accessed through **Prisma ORM** (parameterized queries — no raw SQL injection surface for user input).

## What's fully implemented (real, tested, not mocked)

- User registration/login/refresh/logout with argon2id password hashing and rotating opaque refresh tokens stored in the DB (revocable, so "logout all devices" actually works).
- Full Prisma schema: users, sessions/refresh tokens, conversations, conversation members, messages, reactions, attachments, groups, group members, blocked users, notifications, reports, admin users, audit logs, system settings.
- REST API for auth, user profile/search, blocking, direct + group conversations, messages (send/edit/delete/star/react/forward), media upload with type/size validation, reports.
- Socket.IO real-time layer: authenticated connections (JWT handshake), per-conversation rooms, typing indicators, delivery/read receipts, online/offline + last-seen presence — all server-authoritative.
- Server-side block enforcement: blocking is checked in the API before a conversation or message can be created, regardless of what the mobile UI shows.
- Admin API: dashboard stats, user management (suspend/ban/delete), report moderation, group listing, audit log of every admin action, system settings, all behind role-based access control (`SUPER_ADMIN` / `ADMIN` / `MODERATOR`) enforced in Express middleware, not just hidden in the UI.
- First-admin bootstrap via a local CLI script (`npm run create-admin`) — no default/hard-coded admin credentials anywhere in the codebase.
- Integration tests covering registration/login, server-side block enforcement, and admin RBAC boundaries.
- Docker Compose for local Postgres + backend; GitHub Actions for backend tests, Flutter APK builds, admin dashboard builds.

## What's scaffolded as a real starting client, but not feature-complete

- **Flutter app**: splash screen, register/login, chat list, and a working chat screen wired to real REST calls + a live socket connection are implemented. Screens for group management UI, full settings pages, voice recording UI, and push notification wiring (FCM) are stubbed with clear `// TODO` markers and a documented interface, rather than faked — see `mobile/README.md`.
- **Admin dashboard**: login, dashboard stats, user list with suspend/ban/delete actions, and report queue are implemented against the real admin API. Groups, audit log viewer, and system settings screens are stubbed the same way — see `admin/README.md`.

This split follows the brief's own priority order (§38): authentication → database → backend API → real-time 1-to-1 messaging → mobile app → admin auth → admin user management → reports → groups → media → notifications → advanced features. Everything through "admin user management" is complete end-to-end; later items have real backend support and a documented client integration point, with the remaining UI as the next increment.

## Object storage adapter

Media files are currently written to local disk (`backend/uploads/`, served via `/uploads/*`) for zero-config local development. For production, replace `backend/src/middleware/upload.ts`'s disk storage with an S3-compatible adapter (AWS S3, Cloudflare R2, MinIO, Backblaze B2 all work identically over the S3 API) using the `STORAGE_*` environment variables already defined in `.env.example`. Keep the same `Attachment` shape (`url`, `fileName`, `mimeType`, `sizeBytes`) so no other code needs to change.

## Push notifications

`backend/src/config/env.ts` already reads `FCM_SERVER_KEY`. Wire it up by calling the Firebase Admin SDK from inside the Socket.IO `message_received` emit path (in `src/sockets/io.ts` / `messageController.ts`) when the recipient is offline, sending `{ title: "New message from <name>", body: <preview or nothing, depending on notification-preview privacy setting> }`. Respect each user's notification/privacy settings before including a body preview.

## Branding

"ALMUS CHAT" name, "ALMUS PRODUCTION" branding, package name `com.almus.chat`, and all UI copy are original. No WhatsApp source code, logos, icons, or brand assets are used anywhere in this project.
## Real-time rules (enforced server-side)

- Every socket is authenticated with the access JWT **and** the account must be `ACTIVE`; suspending, banning or deleting a user from the admin API disconnects their live sockets immediately.
- Socket rooms mirror database membership: creating a chat / adding to a group joins the user's sockets (`joinConversationRoom`), removing / leaving a group removes them (`leaveConversationRoom`).
- `typing_*`, `message_delivered` and `message_read` are only accepted from members of the conversation; delivery can only move `SENT -> DELIVERED`.
- Read receipts honour `readReceiptsEnabled`; presence (`user_online` / `user_offline`) is only sent to people who share a conversation with the user and is skipped when `lastSeenVisible` is off.
- Every way of creating a message (text, media upload, forward) goes through `assertCanSend()` in `utils/conversationAccess.ts` (membership + block check).

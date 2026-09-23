# API Reference

Base URL: `http://localhost:4000/api` (dev). All authenticated endpoints require `Authorization: Bearer <accessToken>`.

## Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | – | `{ fullName, username, phoneNumber, email, password }` → `{ user, accessToken, refreshToken }` |
| POST | `/auth/login` | – | `{ identifier, password }` (identifier = username/email/phone) |
| POST | `/auth/refresh` | – | `{ refreshToken }` → rotates and returns new token pair |
| POST | `/auth/forgot-password` | – | `{ identifier }` → always 200; emails a reset link if the account exists (see `backend/src/utils/mailer.ts`) |
| POST | `/auth/reset-password` | – | `{ token, newPassword }` → sets new password, revokes all sessions |
| POST | `/auth/logout` | – | `{ refreshToken }` → revokes that session |
| POST | `/auth/logout-all` | user | Revokes every refresh token for the current user |

## Users

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/me` | user | Current profile |
| PATCH | `/users/me` | user | Update profile/privacy fields |
| POST | `/users/me/change-password` | user | `{ currentPassword, newPassword }` |
| GET | `/users/search?q=` | user | Search by username/phone/name |
| GET | `/users/:id` | user | View a profile (respects privacy settings) |
| POST | `/users/:id/block` | user | Block a user (enforced server-side everywhere) |
| DELETE | `/users/:id/block` | user | Unblock |
| GET | `/users/blocked` | user | List blocked users |

## Conversations & messages

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/conversations` | user | List conversations with last message preview |
| POST | `/conversations` | user | `{ userId }` → get-or-create a direct conversation |
| POST | `/conversations/:id/read` | user | Mark conversation read |
| GET | `/messages/:conversationId` | user | Paginated (`?cursor=`) message history |
| POST | `/messages` | user | `{ conversationId, content, replyToId? }` |
| POST | `/messages/upload` | user | multipart `file` + `conversationId` (+ optional `content`, `replyToId`, `isVoiceNote`) |
| PATCH | `/messages/:id` | user | Edit own message |
| DELETE | `/messages/:id` | user | Soft-delete own message |
| POST | `/messages/:id/star` | user | Toggle star for current user |
| POST | `/messages/:id/react` | user | `{ emoji }` toggle reaction |
| POST | `/messages/:id/forward` | user | `{ conversationId }` forward to another conversation |

## Groups

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/groups` | user | `{ name, description?, memberIds[] }` |
| PATCH | `/groups/:groupId` | group admin | Update name/description/avatar |
| POST | `/groups/:groupId/members` | group admin | `{ memberIds[] }` |
| DELETE | `/groups/:groupId/members/:userId` | group admin | Remove a member |
| PATCH | `/groups/:groupId/members/:userId/role` | group admin | `{ role: "ADMIN" \| "MEMBER" }` |
| POST | `/groups/:groupId/leave` | user | Leave a group |

## Reports

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/reports` | user | `{ targetType, reason, details?, reportedUserId?, messageId?, groupId? }` |
| GET | `/reports/mine` | user | Reports filed by the current user |

## Admin (`/api/admin/*`)

All routes below require an admin JWT from `POST /admin/auth/login`. Role required is noted in parentheses.

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/admin/auth/login` | – | `{ email, password }` |
| GET | `/admin/dashboard` | any admin | Aggregate stats |
| GET | `/admin/server-status` | any admin | API/DB health, uptime |
| GET | `/admin/users` | any admin | `?q=&status=` |
| GET | `/admin/users/:id` | any admin | User detail + reports against them |
| PATCH | `/admin/users/:id/status` | ADMIN+ | `{ status: ACTIVE\|SUSPENDED\|BANNED }` |
| DELETE | `/admin/users/:id` | SUPER_ADMIN | Delete a user |
| GET | `/admin/reports` | any admin | `?status=` |
| PATCH | `/admin/reports/:id` | any admin | `{ status }` |
| GET | `/admin/groups` | any admin | List groups |
| GET | `/admin/audit-logs` | ADMIN+ | Recent admin actions |
| GET | `/admin/settings` | ADMIN+ | List system settings |
| PATCH | `/admin/settings` | SUPER_ADMIN | `{ key, value }` |
| GET | `/admin/admins` | SUPER_ADMIN | List admin accounts |

## Socket.IO events

Connect with `io(url, { auth: { token: accessToken } })`.

**Client → server:** `typing_start`, `typing_stop`, `message_delivered`, `message_read`

**Server → client:** `user_online`, `user_offline`, `message_received`, `message_edited`, `message_deleted`, `message_reaction`, `message_delivered`, `message_read`, `typing_start`, `typing_stop`

All events are scoped to rooms the authenticated socket has actually joined (`conversation:<id>`, `user:<id>`) — a socket cannot receive events for a conversation it isn't a member of.

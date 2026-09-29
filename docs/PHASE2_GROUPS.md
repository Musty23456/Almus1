# ALMUS CHAT — Phase 2 Complete: Groups

This bundle adds a full Groups foundation on top of the current Almus1 project.

## Group features
- Create group with name + description
- Search/select members
- Group conversation creation
- Group info/member list
- Add/remove members through existing backend API
- Promote/demote admins
- Owner protection and ownership handoff on leave
- Leave group
- Group description/name editing
- Admin-only sending permission
- Owner-only group-info editing option
- Invite code generation/regeneration
- Join group through invite code API
- Group lookup by conversation
- Server-side enforcement of admin-only sending

## Exact replacement/addition paths

Replace:
- mobile/lib/screens/group_info_screen.dart (now includes Add members + invite link with Copy)
- backend/src/controllers/groupController.ts
- backend/src/routes/groupRoutes.ts
- backend/src/utils/conversationAccess.ts
- mobile/lib/screens/chat_list_screen.dart

Add:
- mobile/lib/screens/create_group_screen.dart
- mobile/lib/screens/join_group_screen.dart
- backend/prisma/migrations/20260929000000_phase2_groups/migration.sql

Schema change:
- Add these fields to `Group` in `backend/prisma/schema.prisma`:
  `inviteCode String? @unique`
  `onlyAdminsSend Boolean @default(false)`
  `onlyAdminsEditInfo Boolean @default(false)`

The migration SQL in this bundle adds those database columns.

## Important deployment step

The backend package already has:
`npm run prisma:deploy`

Make sure your Render deployment runs Prisma migrations before starting the server. If the current Render build already does this, no additional command is needed. Otherwise set the build command to include:
`npx prisma generate && npx prisma migrate deploy && npm run build`

Do not run `prisma migrate dev` against the production database.

## Mobile
No new package is required for this phase.

## Invite links
The backend generates an `almuschat://group/<inviteCode>` deep-link style value. The join API is:
POST `/api/groups/join/<inviteCode>`

A later deep-link UX phase can automatically open the confirmation screen when the app receives this URI.

## Mobile additions (Phase 2 final)
- Long-press a chat in the Chats list -> "Group info" (opens Group Info; says "not a group" for direct chats)
- Group Info -> "Add members" (admins): search users, select several, Add
- Group Info -> "Invite link": shows code, Copy code, New code
- "+" menu -> "Join with invite code": paste the code or almuschat://group/... link

## Test checklist
1. Create a group with 2+ users.
2. Confirm the group appears in Chats.
3. Open Group Info.
4. Promote/demote a member.
5. Remove a member.
6. Change group name/description.
7. Enable Only admins can send and verify a normal member is rejected server-side.
8. Generate a new invite code.
9. Test join endpoint with another account.
10. Leave group and verify owner handoff.
11. Verify group chat still supports Phase 1 messaging/media/reactions.

## Next
Phase 3: Voice/video calls using WebRTC, with call records, incoming call UI, accept/reject, mute, speaker, camera and call history.

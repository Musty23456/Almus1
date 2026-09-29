# ALMUS CHAT — Phase 1 (part a): Message interactions

Backend
- NEW  backend/src/utils/messageInclude.ts  (attachments + reactions + replyTo preview)
- EDIT backend/src/controllers/messageController.ts  (uses messageInclude)
- EDIT backend/src/controllers/mediaController.ts    (uses messageInclude)

Flutter
- EDIT mobile/lib/models/chat.dart          (Reaction, ReplyPreview, starredBy, copyWith)
- EDIT mobile/lib/screens/chat_screen.dart  (long-press menu, reply bar/quote, edit, react, star, copy, forward, live updates)

Long-press any message: react (😂 ❤️ 👍 😢 😡), Reply, Copy, Forward, Star, and (own messages) Edit / Delete for everyone.
Swipe a bubble sideways to reply. Live updates via message_edited / message_reaction / message_deleted / message_read.

Not yet (next parts): delete for me, message info, camera/documents/audio/location/contact, voice messages, search, date separators, unread divider.

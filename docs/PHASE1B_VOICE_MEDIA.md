# ALMUS CHAT — Phase 1 (part b): Voice messages + more media

Apply: run `cd backend && npx prisma migrate deploy` (adds Attachment.waveform). Then `flutter pub get` in mobile/.

New
- mobile/lib/services/voice_recorder.dart        (hold-to-record, live level, timer, waveform sampling)
- mobile/lib/widgets/voice_message_bubble.dart   (play/pause, seek, waveform, 1x/1.5x/2x speed)
- mobile/lib/widgets/image_viewer_screen.dart    (full-screen pinch-zoom viewer)
- backend/prisma/migrations/20261001000000_voice_waveform/migration.sql

Changed
- chat_screen.dart: mic button (hold, slide left to cancel = delete before sending), attach sheet (Camera, Record video, Gallery, Video, Document, Audio), tap image -> viewer, tap video/document -> opens in phone app
- models/chat.dart (Attachment.waveform), pubspec.yaml (record, audioplayers, file_picker, path_provider, url_launcher), AndroidManifest.xml (<queries> for opening files)
- backend: schema.prisma, mediaController.ts (waveform), upload.ts (+ xls/ppt/zip)

Still to do in Phase 1: send contact, location sharing, delete for me, message info, search, date separators, unread divider, scroll-to-new-message, download progress.

## Phase 1(c) (partial)
- Date separators (Today / Yesterday / date), "scroll to latest" button, in-chat message search (searches the messages already loaded on screen).
- Not yet: unread divider, send contact, location sharing, delete for me, message info, download progress.

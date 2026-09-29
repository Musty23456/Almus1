# ALMUS CHAT — Phase 3: Calls (all 3 parts done)

This part is safe to deploy on its own; it does not change existing behaviour.

## Add (new files)
- backend/src/services/callService.ts
- backend/src/controllers/callController.ts
- backend/src/routes/callRoutes.ts
- backend/prisma/migrations/20260930000000_phase3_calls/migration.sql

## Edit
- backend/prisma/schema.prisma  -> see PHASE3_SCHEMA_PATCH.txt (enums + Call model + 2 lines in User)
- (Already done in this complete zip: routes registered in app.ts, schema.prisma updated)
    import callRoutes from './routes/callRoutes';
    app.use('/api/calls', callRoutes);

## New endpoints
- GET /api/calls              call history (newest first)
- GET /api/calls/ice-servers  STUN (+ TURN if configured)

## TURN server (important)
STUN alone fails for many mobile-network users. Add TURN_URL, TURN_USERNAME, TURN_CREDENTIAL
in the Render environment variables (a hosted TURN service works).

## Next parts
- Part 2: Socket.IO signaling (invite / accept / reject / end / offer / answer / ice) - needs sockets/io.ts
- Part 3: Flutter WebRTC (flutter_webrtc), incoming call screen, call screen, call history tab
  - needs pubspec.yaml, AndroidManifest.xml, socket_service.dart


## Part 2 (done): Socket.IO signaling
New file: backend/src/sockets/callSignaling.ts (wired into sockets/io.ts).

Client -> server: call:invite {calleeId,type} | call:accept {callId} | call:reject {callId} | call:end {callId}
                  call:offer {callId,sdp} | call:answer {callId,sdp} | call:ice {callId,candidate}
Server -> client: call:ringing | call:incoming | call:accepted | call:rejected | call:ended | call:error
                  plus relayed call:offer / call:answer / call:ice

Rules enforced on the server: one call at a time per person, blocked users cannot call,
callee offline or busy = missed immediately, unanswered after 45s = missed,
call ends automatically if a participant disconnects, WebRTC data only relayed on ACCEPTED calls.

Flow: caller call:invite -> callee gets call:incoming -> callee call:accept -> caller gets call:accepted
      -> caller sends call:offer -> callee sends call:answer -> both exchange call:ice.

## Part 3 (done): Flutter
- mobile/pubspec.yaml: flutter_webrtc 0.11.7
- mobile/android/.../AndroidManifest.xml: CAMERA, MODIFY_AUDIO_SETTINGS, BLUETOOTH_CONNECT, ...
- lib/services/call_service.dart: signaling + WebRTC (one call at a time)
- lib/screens/call_screen.dart: outgoing / incoming (Accept, Decline) / in-call controls
- lib/screens/calls_screen.dart: call history tab (tap the icon to call back)
- chat_screen.dart: voice + video buttons in the app bar of 1-to-1 chats
- chat_list_screen.dart: new "Calls" tab; call service starts with the chat socket
- contacts_screen.dart: passes the peer id so the call buttons appear

## Known limits (planned for later phases)
- Incoming calls only ring while the app is OPEN. Ringing when the app is closed needs
  push (FCM) + full-screen notification = Phase 6 (Notifications).
- The ringtone is a simple vibration + system alert sound; a real ringtone comes later.
- Needs a TURN server (TURN_URL / TURN_USERNAME / TURN_CREDENTIAL on Render) to work reliably on mobile data.

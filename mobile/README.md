.# ALMUS CHAT — Mobile (Flutter)

## Setup

```bash
flutter pub get
```

Edit `lib/config/api_config.dart` (or pass `--dart-define=API_BASE_URL=... --dart-define=SOCKET_URL=...`) to point at your backend. On an Android emulator talking to a backend running on your host machine, use `10.0.2.2` instead of `localhost`.

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/api --dart-define=SOCKET_URL=http://10.0.2.2:4000
```

## Implemented (real network calls, no mock data)

- Splash screen → auto-routes to login or the chat list based on a real session check
- Register / login / logout / logout-all-devices
- Forgot password (calls the real `/auth/forgot-password` + `/auth/reset-password` endpoints)
- Chat list backed by `GET /conversations`, live-refreshed on socket events
- Contacts search (`GET /users/search`) → start a real conversation
- Chat screen: loads real history, sends messages over REST, receives them back over a live authenticated Socket.IO connection, shows typing indicator, delete-message, sent/delivered/read ticks
- Settings: real profile + privacy toggles (last seen, profile visibility, read receipts), logout / logout-all

## Not yet built (backend already supports these)

- Group chat screens (create/manage group UI) — backend endpoints in `docs/API.md` under `/groups`
- Media picker + upload UI (the `POST /messages/upload` endpoint is ready; the composer currently only shows where to wire it — see the attach-file button in `chat_screen.dart`)
- Voice message recording UI
- Push notifications (FCM) wiring on the client side
- Message reactions/star/forward/reply UI (the corresponding API calls exist and are documented, but no button surfaces them yet)
- Persisted light/dark theme toggle
- Block/unblock UI from a user's profile screen (the API call exists in `docs/API.md`; there's no dedicated profile screen yet)

None of the above are faked with placeholder UI — they're simply the next screens to build against an already-working API.

## Building the APK

Don't have Android Studio locally? Push to GitHub — `.github/workflows/mobile-ci.yml` installs Flutter, analyzes, tests, and builds a release APK automatically, downloadable from the Actions run's artifacts.

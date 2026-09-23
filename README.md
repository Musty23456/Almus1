# ALMUS CHAT

A real-time messaging platform: **Flutter** mobile app, **Node.js/TypeScript** backend (REST + Socket.IO), **PostgreSQL** database (Prisma ORM), and a **React** admin dashboard.

Developed by **ALMUS PRODUCTION**. Author: **Musty**.

> Status: Core backend (auth, database, real-time messaging, blocking, groups, reports, admin API with RBAC + audit logs) is complete and tested. The Flutter app and React admin dashboard included here are functional starter clients wired to the real API — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for what's implemented vs. still to build out.

## 1. Project overview

ALMUS CHAT lets users register, find each other, and exchange real-time text/media messages 1-to-1 or in groups, with read receipts, typing indicators, blocking, reporting, and full admin moderation tooling. Every feature in this README talks to a real backend and a real Postgres database — there are no mocked responses in the core flows.

## 2. Architecture

```
almus-chat/
├── mobile/       Flutter app (Android)
├── backend/      Express + TypeScript API, Socket.IO server, Prisma/PostgreSQL
├── admin/        React + Vite admin dashboard
├── database/     Prisma schema lives in backend/prisma; this folder holds notes/ERDs
├── .github/workflows/   CI: backend tests, mobile APK build, admin build, docker build
└── docs/         API.md, ARCHITECTURE.md, DEPLOYMENT.md, ADMIN.md
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full data flow and design decisions.

## 3. Requirements

- Node.js 20+
- PostgreSQL 14+ (or Docker)
- Flutter 3.24+ (for mobile) with Android SDK, **or** just push to GitHub and let Actions build the APK for you
- Docker + Docker Compose (optional, recommended for local dev)

## 4. Quick start (Docker)

```bash
cp .env.example .env          # then edit secrets in .env
docker compose up             # starts Postgres + backend on :4000
```

## 5. Manual local installation

### 5.1 Database setup

```bash
# If not using Docker, install PostgreSQL locally and create a database:
createdb almus_chat
```

### 5.2 Environment variables

Copy `.env.example` to `backend/.env` and fill in real values (see file for every variable). At minimum set:

- `DATABASE_URL`
- `JWT_SECRET`, `JWT_REFRESH_SECRET` (generate with `openssl rand -hex 64`)

### 5.3 Running the backend

```bash
cd backend
npm install          # also generates package-lock.json - safe to commit for reproducible/faster CI installs
npx prisma generate
npx prisma migrate dev --name init
npm run dev          # http://localhost:4000
```

### 5.4 Creating the first admin

**Never** ships with default admin credentials. Create the first SUPER_ADMIN via the secure CLI script:

```bash
cd backend
npm run create-admin
```

You'll be prompted for name, email, and a hidden password. See [`docs/ADMIN.md`](docs/ADMIN.md) for details and how to promote/create further admins from the dashboard afterward.

### 5.5 Running the Flutter app

```bash
cd mobile
flutter pub get
flutter run    # point lib/config/api_config.dart at your backend URL first
```

### 5.6 Running the admin dashboard

```bash
cd admin
npm install
npm run dev    # http://localhost:5173
```

### 5.7 Running tests

```bash
cd backend
# Requires a reachable Postgres test database (docker-compose's postgres works fine):
DATABASE_URL=postgresql://almus:almus_password@localhost:5432/almus_chat_test?schema=public npx prisma migrate deploy
npm test
```

## 6. GitHub Actions

Four workflows live in `.github/workflows/`:

- `backend-ci.yml` — spins up Postgres, runs migrations, type-checks, tests, and builds the backend on every push/PR touching `backend/`.
- `mobile-ci.yml` — installs Flutter (no local Android Studio required), formats/analyzes/tests, and builds a release APK, uploaded as a workflow artifact you can download from the Actions tab.
- `admin-ci.yml` — lints, type-checks, and builds the React dashboard.
- `docker-build.yml` — optional backend Docker image build (manually triggered or on backend changes).

## 7. Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for step-by-step guides to deploy the backend (Render/Railway/Fly.io), the admin dashboard (Vercel), and distribute the Android APK.

## 8. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Missing required environment variable: JWT_SECRET` | `.env` not created/loaded — copy `.env.example` to `backend/.env` |
| Prisma `P1001: Can't reach database server` | Postgres isn't running, or `DATABASE_URL` is wrong |
| Mobile app can't reach backend | Update the base URL in `mobile/lib/config/api_config.dart`; on an Android emulator, use `10.0.2.2` instead of `localhost` |
| Admin login always fails | You haven't run `npm run create-admin` yet |
| File upload rejected | Check `MAX_UPLOAD_SIZE_MB` and the allowed MIME types in `backend/src/middleware/upload.ts` |

## 9. License / branding

ALMUS CHAT is an original project. It does not use WhatsApp's source code, logo, or proprietary assets — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for branding notes.
# Almus1

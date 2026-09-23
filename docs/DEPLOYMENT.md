# Deployment

## Backend (Render / Railway / Fly.io — any standard Node host works)

1. Push this repo to GitHub.
2. Create a PostgreSQL instance (Render/Railway both offer managed Postgres; note the connection string).
3. Create a new Web Service pointing at `backend/` as the root directory.
   - Build command: `npm install && npx prisma generate && npm run build`
   - Start command: `npx prisma migrate deploy && npm start`
4. Set environment variables from `.env.example` (`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN` set to your admin dashboard's deployed URL, etc.). Generate secrets with `openssl rand -hex 64` — never reuse the dev values.
5. Once deployed, run the admin bootstrap once against production:
   ```bash
   # from your machine, pointed at the prod DATABASE_URL
   DATABASE_URL=<prod-url> npm run create-admin
   ```
6. Configure a persistent volume (or switch to the S3-compatible storage adapter described in `docs/ARCHITECTURE.md`) so uploaded media survives redeploys — most PaaS containers have ephemeral disks.

## Admin dashboard (Vercel or any static host)

1. Import the repo into Vercel, set the project root to `admin/`.
2. Build command: `npm run build`, output directory: `dist`.
3. Set `VITE_API_BASE_URL` to your deployed backend's URL (e.g. `https://almus-backend.onrender.com/api`).

## Mobile app (Android APK via GitHub Actions)

1. Push to GitHub — `mobile-ci.yml` runs automatically on changes under `mobile/`, or trigger it manually from the Actions tab (`workflow_dispatch`).
2. Before your first real release, update `mobile/lib/config/api_config.dart` with your deployed backend URL and socket URL.
3. Download the built APK from the workflow run's **Artifacts** section (`almus-chat-release-apk`).
4. For a signed Play Store release, add a signing config and store the keystore + `key.properties` as GitHub Actions secrets — this is intentionally left out of the default workflow since it requires your own signing identity.

## Post-deploy checklist

- [ ] `.env` / dashboard env vars contain no dev/test secrets
- [ ] `CORS_ORIGIN` restricted to your real admin dashboard domain (not `*`)
- [ ] First SUPER_ADMIN created via the CLI script, not a hardcoded credential
- [ ] Media storage is durable (volume or object storage), not the container's ephemeral disk
- [ ] `NODE_ENV=production` set on the backend

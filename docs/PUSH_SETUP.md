# Push notifications — setup checklist

Push needs **both sides** to use the **same Firebase project**.

## 1. Firebase project
1. Firebase console > your project > Project settings > **General** > Your apps > **Add app > Android**.
   Package name MUST be exactly `com.almus.chat`. Download `google-services.json`.
2. Project settings > **Cloud Messaging**: make sure **Firebase Cloud Messaging API (V1)** is *Enabled*
   (if it says disabled, open the three-dots menu > "Manage API in Google Cloud Console" > Enable).
3. Project settings > **Service accounts** > **Generate new private key** > download the JSON file.

## 2. Server (Render)
Render > your service > **Environment** > add `FCM_SERVICE_ACCOUNT_JSON` = the **entire contents** of the JSON from step 1.3
(raw JSON, or base64 of it). Save and redeploy.
In the Render logs you should see: `[push] Firebase key loaded - push notifications are ON`.
(`FCM_SERVER_KEY` is the old method and is ignored.)

## 3. App (GitHub Actions)
GitHub repo > Settings > Secrets and variables > Actions > **New repository secret**:
`GOOGLE_SERVICES_JSON` = the entire contents of `google-services.json`.
Re-run the "Mobile CI" workflow (log line: `google-services.json written - push notifications enabled in this build`),
download the new APK and **install it over the old one**, then log in again.

## 4. Test
In the app: **Settings > Test notifications**. The report tells you which step fails:
- "Firebase is not set up in this app build" -> step 3.
- "notification permission is denied" -> Android Settings > Apps > ALMUS CHAT > Notifications.
- "The server has no Firebase key" -> step 2.
- "DIFFERENT Firebase projects" / "Firebase refused the request" -> steps 1.2 and 1.3 (same project!).
- All green but nothing shows -> press Home first: while the app is open you get an in-app banner instead of a system notification.

## Notes
- Render's free plan sleeps after ~15 min idle; the first message after that wakes it, so push can be a few seconds late.
- Ringing for calls while the app is closed needs a separate high-priority "call" push (planned, Phase 6).

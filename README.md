# BeaTrackFam Rewards

BeaTrackFam Rewards is our way of saying thank you for rocking with the Fam. Every order earns you points, points unlock rewards, and the more you stick with us, the more love comes back your way. Loyalty above all — that's the whole idea. This is the standalone loyalty app for the BeaTrackFam community: sign in, watch your points grow, climb the tiers, and never miss a drop or exclusive reward again.

## Requirements

- **Node 24** and **npm** (pinned by the CI workflows — use Node 24 locally too)
- An **Expo account** (free) — needed for EAS builds
- A **Supabase project** (free tier works) — this is where points, tiers, and member data live
- An **Apple Developer** account and **Google Play Console** account (both already on the team) — needed for store builds and uploads

## Setup

1. Clone the repo: `git clone <repo-url>` and `cd beatrackfam-loyalty-app`
2. Install dependencies: `npm install`
3. Copy the example env file: `cp .env.example .env`
4. Add your Supabase URL and anon key to `.env` (see the Env vars table below)
5. In the Supabase dashboard, open the SQL editor and run `supabase/schema.sql`, then `supabase/seed.sql`
6. Start the dev server: `npx expo start`

## Env vars

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL (Project Settings → API) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon (public) key (Project Settings → API) |

Never commit `.env` — it's gitignored. Secrets that CI needs live in GitHub Secrets instead (see below).

## EAS

`eas.json` defines the build profiles:

- **development** — dev build for local testing on a device
- **preview** — shareable internal build
- **production** — the store-bound build (no `autoIncrement` — the build numbers below are the source of truth)

Link this project in `app.json` under `expo.extra.eas.projectId` (run `npx eas-cli init` once to create the project and wire the ID in). Cloud builds via EAS are the fallback if the GitHub Actions workflows ever need one.

## GitHub Secrets

Set these under the repo's **Settings → Secrets and variables → Actions** before running the build workflows.

### iOS (`ios-build.yml`)

| Secret | What it is |
|---|---|
| `ASC_API_KEY_ID` | App Store Connect API key ID |
| `ASC_API_KEY_P8` | The `.p8` private key contents (full file, including the BEGIN/END lines) |
| `ASC_API_ISSUER_ID` | App Store Connect API issuer ID |
| `APPLE_TEAM_ID` | The Apple Developer Team ID |

### Android (`android-build.yml`)

| Secret | What it is |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64 of the upload `.jks` — must be generated for THIS app (see below), never reused from the main app |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | Google Play service-account key JSON (plain text) |

## Builds

Both workflows are **manual-only** — nothing runs on its own. Go to the repo's **Actions** tab, pick the workflow, and click **Run workflow**.

- **Build iOS IPA (Rewards)** — macOS runner, builds and signs the IPA with the App Store Connect API key. The `upload_to_testflight` input (default: on) sends the finished IPA to TestFlight with 3 retries; turn it off to just download the IPA artifact. The IPA is also saved as a run artifact (`BeaTrackFamRewards-<version>-<build>-ipa`, kept 30 days).
- **Build Android AAB (Rewards)** — Linux runner, builds and signs the AAB with the upload keystore (decoded from secrets, deleted after every run). The `upload_to_play` input (default: off) sends the finished AAB to Google Play **production** as a completed release when turned on. The AAB is also saved as a run artifact (`BeaTrackFamRewards-<version>-<code>-aab`, kept 30 days).

### Build-number discipline (Joey's rule)

Every store-bound build bumps the build number by **exactly +1** — `expo.ios.buildNumber` and `expo.android.versionCode` in `app.json`, and both stay in sync with each other and with the marketing `version`. The stores reject reused build numbers, so a bump is required even when only the platform changed. The workflows read the numbers straight from `app.json`, so what you commit is what ships.

## Store submission checklist (human steps)

These are the things only Joey (or a signed-in teammate) can do — CI can't:

1. **Supabase** — create the project, run `supabase/schema.sql` and `supabase/seed.sql`, copy the URL + anon key into `.env` (and `EXPO_PUBLIC_*` values used at build time).
2. **App Store Connect** — create the app record for bundle ID `com.beatrackfaminc.rewards`; then create the API key and add the four iOS secrets.
3. **Play Console** — create the app for package `com.beatrackfaminc.rewards`; generate this app's own upload keystore (EAS: `npx eas-cli credentials -p android`, or `keytool -genkeypair`), base64 it into `ANDROID_KEYSTORE_BASE64` with the matching password/alias secrets; add the Play service-account key as `PLAY_SERVICE_ACCOUNT_JSON`.
4. **Screenshots & listing** — capture the required phone screenshots and write the listing (draft copy lives in `store/listing.md`).
5. **Review submission** — run the iOS workflow with `upload_to_testflight` on, submit the build for review in App Store Connect; run the Android workflow with `upload_to_play` on (or upload the AAB manually) and roll out through Play Console review.

## Version

**1.0.0 (1)** — first release.

### What's new in 1.0.0

- Welcome to BeaTrackFam Rewards — earn points on every order, automatically
- Climb the loyalty tiers and unlock bigger rewards as you go
- Refer your friends and earn bonus points when they join the Fam
- Birthday treat on us, just for being part of the family
- Get notified first about new drops and exclusive member rewards

Questions or concerns? Email us at contact@beatrackfam.info

# BeaTrackFam Rewards — Official Loyalty App

The official iOS and Android loyalty app for **BeaTrackFam** ([beatrackfam.info](https://beatrackfam.info)) — the custom-designed merch and apparel brand founded in 2020. Built on one idea: **Loyalty Above All.** This is our way of saying thank you for rocking with the Fam: every order earns points, points unlock rewards, and the more you stick with us, the more love comes back your way.

This repository is the full source of the app and its release history. Every version ships here first: source, a version tag, and a GitHub Release with the What's New notes.

**Version in development:** 1.0.0 (iOS build 1 · Android versionCode 1) · **Live in stores:** not yet — first release · **Bundle ID / package:** `com.beatrackfaminc.rewards` · **Platforms:** iOS & Android (Expo / React Native)

> Build numbers increment by exactly 1 on every store upload (TestFlight, App Store, or Google Play), even when the marketing version doesn't change — the stores reject reused build numbers.

---

## Screenshots

The 1.0.0 design — Home, Earn, Rewards, Refer, and Profile (captured from a live render):

![Home](store/screenshots/01-home.png) ![Earn](store/screenshots/02-earn.png) ![Rewards](store/screenshots/03-rewards.png)

---

## What the app does

### Earn points for being part of the Fam
- **Home** shows your points balance, your tier, and a progress bar to the next tier — **Fam → Loyal → Ride or Die**.
- **Earn** actions: shop at beatrackfam.info (25 pts per order), refer a friend (50 pts each), follow on Instagram/TikTok (20 pts), a 100-pt birthday bonus every year, and points for writing product reviews.
- Recent activity feed with a full points history on your Profile.

### Redeem real rewards
- **Rewards** catalog: 100 pts = 10% off, 250 pts = free shipping, 500 pts = $10 off, 1000 pts = a free tee.
- Redeeming generates a personal redemption code on the spot — copy it and use it at checkout.

### Bring the Fam
- **Refer** gives you a personal referral code with a native share sheet — when a friend joins with your code, you both get 50 pts. No limit.

### Push notifications with deep links
- Reward drops, points milestones, and referral alerts. Tapping a notification opens the right tab — rewards, home, refer, wherever it belongs.
- A proper permission pre-prompt on first launch (shown once); the OS prompt only fires if you opt in. Managed anytime in your phone settings.

### Live Activities (iOS 16.2+)
- When you're within striking distance of your next reward, a Lock Screen / Dynamic Island card shows live progress ("40 pts to your free tee"). It updates as points accrue and closes out when you redeem. Powered by the official `expo-widgets` package.

### Look & feel
- iOS 26 **Liquid Glass** design language via `expo-glass-effect` — glassy tab bar, cards, and sheets, with graceful fallback to the classic dark cards on older iOS and Android.
- The black & white BeaTrackFam look: eye logo, dark UI, bold condensed headlines. Loyalty up front.

### Your account
- Email sign-up/sign-in via Supabase Auth, with optional referral code at signup (both sides get their 50 pts automatically).
- Works in **demo mode** with sample data until the database is connected — no dead screens, ever.

---

## Requirements

### For members (minimum OS to download & run)

| Platform | Minimum OS | Notes |
|---|---|---|
| iOS | **iOS 16.4 or later** | Set by the app's iOS deployment target (16.4). Live Activities need iOS 16.2+; Liquid Glass needs iOS 26. |
| Android | **Android 7.0 (API 24) or later** | Set by `minSdkVersion` (24). |

### API / OS levels the app targets

| Platform | Level | Value |
|---|---|---|
| Android | Target API (`targetSdkVersion`) | **36 — Android 16** (Google Play's required target for new apps and updates since Aug 31, 2026) |
| Android | Compile API (`compileSdkVersion`) | **36 — Android 16** |
| Android | Minimum API (`minSdkVersion`) | **24 — Android 7.0** |
| iOS | Deployment target (minimum OS) | **iOS 16.4** |

These levels are pinned explicitly in `expo-build-properties` and re-checked against current App Store and Google Play requirements at every release, so the app never silently falls behind a store API deadline.

### For developers

- **Node.js 24** and npm (pinned by the CI workflows — use Node 24 locally too)
- An **Expo account** (free) — needed for EAS builds
- A **Supabase project** (free tier works) — points, tiers, and member data live there
- An **Apple Developer** account and **Google Play Console** account — needed for store builds and uploads

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK 57 · React Native 0.86 · React 19 · TypeScript |
| Navigation | Expo Router (typed routes, deep-link ready) |
| Backend | Supabase (Postgres + Auth, RLS on every table) |
| Push | `expo-notifications` (Expo Push Service) |
| Live Activities | `expo-widgets` (official, iOS 16.2+) |
| Design | `expo-glass-effect` (Liquid Glass, iOS 26+ w/ fallback) |
| Privacy | `expo-tracking-transparency` (opt-in only) |
| Builds | GitHub Actions (macOS + Linux runners), EAS as fallback |

---

## Getting started (development)

1. Clone the repo: `git clone https://github.com/Joeey1116/BeaTrackFam-Loyalty-App.git` and `cd BeaTrackFam-Loyalty-App`
2. Install dependencies: `npm install`
3. Copy the example env file: `cp .env.example .env` and paste the Supabase values (see Env vars below)
4. In the Supabase dashboard SQL editor, run `supabase/schema.sql`, then `supabase/seed.sql`, then `supabase/migration_push_token.sql`
5. Start the dev server: `npx expo start`

Without Supabase keys the app runs in **demo mode** with realistic sample data — every screen still works.

### Env vars

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://dqrtrzzakdjgvradhfeq.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnRyenpha2RqZ3ZyYWRoZmVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2OTkyOTEsImV4cCI6MjEwNzI3NTI5MX0.MGrkk14Qdv867zTf16haq4WWV-Nf06X_YwecJwuBsk4` |

These are wired into `eas.json` (all three build profiles) so cloud builds get them automatically — the anon key is public-safe by design (it ships inside the app binary; RLS protects the data). For local dev, paste the same values into `.env`. Never use the `service_role` key in the app.

**Supabase project status:** the project is live and reachable, but the SQL files have NOT been run yet (verified via the REST API — `public.rewards` doesn't exist). Run all three files once in the SQL editor (SQL Editor → New query → paste → Run). After that the app switches from demo mode to live data automatically.

Never commit `.env` — it's gitignored. Secrets that CI needs live in GitHub Secrets instead (see below).

---

## Project structure

```
app/                    # Expo Router screens
  _layout.tsx           # Root stack + notification-tap deep-link routing
  index.tsx             # Auth gate (session → tabs, else → onboarding)
  onboarding.tsx        # 3-screen flow: welcome → how it works → join (skippable)
  sign-in.tsx sign-up.tsx
  (tabs)/               # Home · Earn · Rewards · Refer · Profile
components/             # GlassCard, GlassTabBackground, PointsCard, TierBar, …
lib/                    # supabase client, loyalty helpers, notifications, liveActivity
widgets/                # PointsActivity Live Activity layout ('widget' directive)
plugins/                # with-privacy-manifest.js (PrivacyInfo.xcprivacy generator)
supabase/               # schema.sql, seed.sql, migration_push_token.sql, README
assets/                 # icon, splash, notification icon, favicon
.github/workflows/      # ios-build.yml, android-build.yml (manual dispatch)
store/                  # listing.md (store copy) + screenshots/
```

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

---

## Store compliance

### Apple
- **PrivacyInfo.xcprivacy** — generated at prebuild by `plugins/with-privacy-manifest.js` (verified: lands in `ios/BeaTrackFamRewards/`). Covers required-reason APIs: UserDefaults (CA92.1), FileTimestamp (C617.1), SystemBootTime (35F9.1), DiskSpace (E174.1). Declares collected data: email address + product interaction (points activity), both linked-not-tracking, purpose app-functionality. `NSPrivacyTracking: false`, no tracking domains.
- **App Tracking Transparency** — `expo-tracking-transparency` plugin sets `NSUserTrackingUsageDescription`. The prompt only fires when the user taps **Profile → Privacy → Allow tracking**; it is never requested automatically. (There are no ads and no third-party tracking SDKs — the permission exists for completeness.)
- **Push Notifications** — `expo-notifications` plugin adds the `aps-environment` entitlement (verified in the prebuilt entitlements) and `NSUserNotificationsUsageDescription` explains the purpose.
- **Live Activities** — the `expo-widgets` plugin scaffolds the WidgetKit extension target (`com.beatrackfaminc.rewards.widgets`) at prebuild and sets `NSSupportsLiveActivities` (verified in the prebuilt project).

### Google
- **API levels** — min 24 / compile 36 / target 36 (pinned in `expo-build-properties`, matching the main app's discipline; Play requires target 36 for new apps since Aug 2026).
- **16 KB page size** — ready: Expo SDK 57 builds with AGP 8.x (16 KB ELF alignment supported since AGP 8.5.1); the app ships no native `.so` libraries of its own (pure JS + Expo modules), so there's nothing to realign.
- **Data Safety form** (answers for the Play Console questionnaire):
  - Data collected: **Email address** (account), **App activity** (points/ledger — app functionality)
  - Data shared: **Supabase** (the app's backend — data processor, not a third party for advertising)
  - No data shared with third parties for advertising; **no ads**; no third-party tracking SDKs
  - Data is encrypted in transit (HTTPS/TLS); users can request account deletion via contact@beatrackfam.info

### Push notifications — deep-link contract
Every push carries `data.target` → the app opens that tab on tap (cold start and warm):
| `target` | Opens | Used for |
|---|---|---|
| `rewards` | Rewards tab | New reward available |
| `home` | Home tab | Points earned / milestone |
| `refer` | Refer tab | A referred friend joined |
| `earn` | Earn tab | Bonus-earning opportunities |
| `profile` | Profile tab | Account notices |

Push tokens are saved to `profiles.push_token` (run `supabase/migration_push_token.sql`). The permission pre-prompt appears once on first Home visit; the OS prompt only fires if the user taps "Turn on notifications".

---

## Store submission checklist (human steps)

These are the things only Joey (or a signed-in teammate) can do — CI can't:

1. **Supabase** — project created ✅ (`https://dqrtrzzakdjgvradhfeq.supabase.co`). Still needed: run `supabase/schema.sql`, `supabase/seed.sql`, then `supabase/migration_push_token.sql` once in the SQL editor (schema not applied yet — verified via REST API).
2. **App Store Connect** — create the app record for bundle ID `com.beatrackfaminc.rewards`; then create the API key and add the four iOS secrets.
3. **Play Console** — create the app for package `com.beatrackfaminc.rewards`; generate this app's own upload keystore (EAS: `npx eas-cli credentials -p android`, or `keytool -genkeypair`), base64 it into `ANDROID_KEYSTORE_BASE64` with the matching password/alias secrets; add the Play service-account key as `PLAY_SERVICE_ACCOUNT_JSON`.
4. **Screenshots & listing** — capture the required phone screenshots and write the listing (draft copy lives in `store/listing.md`).
5. **Review submission** — run the iOS workflow with `upload_to_testflight` on, submit the build for review in App Store Connect; run the Android workflow with `upload_to_play` on (or upload the AAB manually) and roll out through Play Console review.

## About BeaTrackFam

BeaTrackFam ([beatrackfam.info](https://beatrackfam.info)) is a custom-designed merch and apparel brand founded in 2020 — tees, hoodies, sweatshirts, and more, designed from scratch. The whole brand runs on one idea: **Loyalty Above All.** Community over profit, good quality at fair prices. This rewards app is our thank-you to the Fam.

## Version

**1.0.0 (1)** — first release.

### What's new in 1.0.0

- Welcome to BeaTrackFam Rewards — earn points on every order, automatically
- Climb the loyalty tiers and unlock bigger rewards as you go
- Refer your friends and earn bonus points when they join the Fam
- Birthday treat on us, just for being part of the family
- Get notified first about new drops and exclusive member rewards

Questions or concerns? Email us at contact@beatrackfam.info

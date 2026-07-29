# Building the DryClean POS Android APK

This project's web app (`www/`) and the native Android project (`android/`) are already generated and committed. This machine has Node.js but **no Java/Android SDK**, so the final compile step must run on a computer with **Android Studio** installed. Everything up to that point is already done for you.

## What's already done

- `www/` — the complete offline-first web app (HTML/CSS/vanilla JS), fully tested in a browser.
- `android/` — generated via `npx cap add android`, already synced with the latest `www/` build (`npx cap sync android`), with 4 Capacitor plugins wired in:
  - `@capacitor-community/sqlite` (offline encrypted SQLite)
  - `@capacitor/camera`, `@capacitor/filesystem`, `@capacitor/preferences`
- `AndroidManifest.xml` already declares the `CAMERA` permission (needed for the QR scanner and photo capture) and `INTERNET` (Capacitor's default WebView requirement — the app makes no network calls itself; internet is not required to use the app).
- `capacitor.config.json` — app id `com.soothmedia.drycleanpos`, app name "DryClean POS", encrypted SQLite enabled.

## One-time setup on your build machine

1. Install **Android Studio** (includes the Android SDK) — https://developer.android.com/studio
2. Install a **JDK 17** (Android Studio bundles one; standalone Temurin 17 also works).
3. Install **Node.js 18+** if this project is being built on a different machine than it was developed on.

## Build steps

```bash
# from the project root
npm install          # installs @capacitor/cli and friends (already run once here)
npx cap sync android # re-run this any time you change files under www/
npx cap open android # opens the android/ folder in Android Studio
```

In Android Studio:

1. Let Gradle finish its initial sync (first time only — downloads Gradle + AGP, needs internet once).
2. **Run ▶** on a device/emulator to test, or
3. **Build → Generate Signed Bundle / APK → APK** to produce a release APK:
   - Create a new keystore (or use an existing one) when prompted — keep the keystore file and passwords safe, you'll need the *same* keystore for every future update to this app.
   - Choose the `release` build variant.
   - The signed APK lands in `android/app/release/app-release.apk`.

No further code changes are required — the manifest, permissions, and plugin config are already in place.

## If you change the web app later

Any time you edit files under `www/`, re-run:

```bash
npx cap sync android
```

then rebuild in Android Studio. You do **not** need to re-run `cap add android`.

## Notes & platform-specific behavior

- **Offline by design**: no server, no API calls. All data lives in an on-device SQLite database (`@capacitor-community/sqlite`, encrypted).
- **Backup file format differs by platform**: the web/browser build exports a raw `.sqlite` file; the native Android build (via the SQLite plugin) exports a `.json` dump instead. A backup taken on one platform can only be restored on that same platform — this is explained in the app's Backup screen.
- **Camera features** (QR scanner, customer/item photo capture) use standard web APIs (`getUserMedia`, `<input type="file" capture>`) that Capacitor's WebView already supports once the `CAMERA` permission is granted at runtime — no extra native plugin code was needed.
- **WhatsApp integration** opens `wa.me` deep links via the device's default browser/WhatsApp app; the phone number is normalized using the shop's configured country code (Settings → WhatsApp Country Code).
- **Printing** (labels/receipts/reports) calls `window.print()`, which on Android hands off to the system Print dialog (Save as PDF, or print over Wi-Fi to a supported printer) — fully offline.
- **App icon/splash**: currently using Capacitor's default icon. To brand it, replace the images under `android/app/src/main/res/mipmap-*` (icon) and see https://capacitorjs.com/docs/guides/splash-screens-and-icons for the asset-generation tool.

## Product-key licensing (anti-resale)

Every install requires a product key before it will show the login screen — see `www/js/services/licenseService.js`. Keys are Trial (7 days), Monthly (30 days), or Lifetime, and are verified fully offline (no server call).

**To issue a key for a customer**, run this on your own dev machine (never on a customer's device):

```bash
node keygen.js trial            # one 7-day key
node keygen.js month 3          # three 30-day keys
node keygen.js lifetime 1 "Ali's Laundry - paid in full"   # one lifetime key with a note
```

Every key generated is printed to the console **and** appended to `product-keys.txt` in the project root, so you always have your own record of who has which key. Neither `keygen.js` nor `product-keys.txt` is ever bundled into the APK (they live outside `www/`, which is the only folder Capacitor syncs) — keep both private.

**Important limitation to know about**: because the app must work with zero internet access, this check runs entirely inside the JS that ships in the APK. A technically determined person could theoretically decompile the APK and find the verification logic. What this system reliably stops is casual copying/resale — every fresh install demands a real key, and trial/monthly keys self-expire even if shared. It is not unbreakable DRM; true tamper-proof licensing would require a server round-trip, which conflicts with the offline requirement.

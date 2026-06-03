# Release automation

One command per platform to cut a release — local build, then upload. No clicking.

```sh
./scripts/release-ios.sh       # bump build # → archive → IPA → TestFlight
./scripts/release-android.sh   # bump versionCode → signed .aab → Play internal
```

Both bump the version, build a **signed release** locally, and upload. Re-runnable: each run increments the version so the store accepts it.

---

## What is NOT automatable (one-time, manual, per platform)

Neither store lets an API create a **new app record** — this is a hard limitation, done once in the web UI:

- **Apple:** App Store Connect → My Apps → New App (bundle `app.veloscape`). ✅ already done.
- **Google:** Play Console → Create app (package `app.veloscape`). ⬜ do once.

After the record exists, the scripts above handle every future release.

---

## One-time setup

### Apple (done)
- `scripts/release.env` holds `ASC_KEY_ID`, `ASC_ISSUER`, `ASC_KEY_PATH`, `APPLE_TEAM` (copy from `release.env.example`). Gitignored.
- The `.p8` lives at `~/Downloads/AuthKey_<id>.p8` (and `~/.appstoreconnect/private_keys/` for `altool`).

### Google (do once)
1. **Create the app** in Play Console (above).
2. **Create a service account** for uploads:
   - Google Cloud Console → the project linked to Play → IAM & Admin → Service Accounts → Create → download the **JSON key**.
   - Play Console → Users & permissions → Invite the service-account email → grant **Release** access (Admin or a custom role with "Release to testing tracks").
3. Save the JSON as **`./google-play-service-account.json`** (repo root, gitignored).
4. **First upload of a brand-new app must be done once in the Console** (Google blocks the very first AAB via API); after that `release-android.sh` works headlessly.
5. Keystore must exist (`android/keystore.properties` + `~/.android-keystores/veloscape-upload.jks`) — already set up.

---

## Notes
- Secrets (`scripts/release.env`, `google-play-service-account.json`, `*.p8`, the keystore) are **gitignored** — the repo is public. Back them up separately.
- iOS uploads via `altool`; Android via `eas submit` (reads the service account from `eas.json`). Builds are always local (no EAS cloud builds).
- To change the Play track, edit `submit.production.android.track` in `eas.json` (default `internal`).

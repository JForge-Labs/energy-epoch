# Cloud Mac / Xcode session — Energy Epoch

Use this on a **rented Mac** after ASC + Bundle ID exist and the repo has `ios/`.

## Ship path for 1.0 (read this)

| Method | Status |
|--------|--------|
| **Local Archive on Mac** → Upload to App Store Connect | **Canonical** — use this |
| **Xcode Cloud** (build from GitHub in the cloud) | **Optional** — needs GitHub link + `ci_scripts/ci_post_clone.sh` (in repo) |

### Xcode Cloud known failure (fixed in git)

Windows `npx cap sync ios` used to commit `ios/App/CapApp-SPM/Package.swift` with **backslash** paths:

```swift
path: "..\\..\\..\\node_modules\\@capacitor\\app"  // Swift: invalid escape sequence
```

Mac / Xcode Cloud then die resolving packages. Fix:

1. `Package.swift` must use **POSIX** `/` separators (committed).  
2. `npm run cap:sync` runs `scripts/fix-ios-spm-paths.mjs` after every sync.  
3. Xcode Cloud post-clone: `ci_scripts/ci_post_clone.sh` → `npm ci` + build + cap sync + path fix.

If Cloud still emails failures: confirm the workflow branch is **`main`**, GitHub app can read **JForge-Labs/energy-epoch**, and Node is available on the Cloud image.

### Stop Xcode Cloud failure emails (do this now)

Every push to `main` (including web deploys) can trigger a half-configured **Xcode Cloud** workflow → Apple emails “xcodebuild failed” even when you only changed the website.

**Disable it (2 minutes):**

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Energy Epoch**  
2. **Xcode Cloud** (left sidebar; or Xcode → **Integrate / Product → Xcode Cloud**)  
3. Open each **Workflow** → **Manage Workflow** / **⋯** → **Delete** or turn **Start Conditions** off  
4. Optionally: Xcode → Settings → Accounts → remove Cloud for this product  

Canonical iOS ship remains **local Mac: Product → Archive → Upload**.  
Repo has `ci_scripts/` for a future Cloud setup, but **do not rely on Cloud for 1.0**.

---

## Prerequisites

- [ ] Apple Developer membership **Active**
- [ ] App Store Connect app created (SKU, Bundle ID `com.playenergyepoch.app`)
- [ ] Repo cloned (**`~/energy-epoch`** on MacinCloud user `user948910` historically)
- [ ] Branch: prefer **`main`** after merge (was `graphics/pixi-atlas-v1` during TF polish)
- [ ] Privacy URL works: https://playenergyepoch.com/privacy
- [ ] Listing fields from `IOS_ASC_LISTING_1.0.md` pasted into ASC (can finish before binary)
- [ ] Screenshots uploaded (at least `store-assets/ios/screenshots/iphone-6.7/*`)

## One-time on the Mac

1. Install **Xcode** from Mac App Store; open once, accept license, install components.  
2. Xcode → Settings → Accounts → add your **Apple ID** (Developer team).  
3. Terminal:

```bash
cd ~/energy-epoch   # actual path on MacinCloud — not a placeholder
git fetch origin
git checkout main
git pull
npm ci
npm run cap:sync
npm run cap:open:ios
```

If `cap:open:ios` fails: `open ios/App/App.xcodeproj`

## In Xcode (local Archive only)

1. Select the **App** target → **Signing & Capabilities**  
2. **Team:** your personal/company team (paid Developer, not Personal Team only)  
3. Bundle Identifier: `com.playenergyepoch.app` (must match ASC)  
4. Deployment: iOS **15.0** or higher  
5. Destination: **Any iOS Device (arm64)** — not a simulator  
6. Menu bar (top of Mac screen): **Product → Archive**  
7. Organizer → **Distribute App** → **App Store Connect** → **Upload**  

Skip **Xcode Cloud** onboarding if it appears after Archive or package resolve.

## After upload

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → your app → **TestFlight**  
2. Wait for processing (often 5–30 min)  
3. Internal Testing → add yourself → install **TestFlight** on iPhone → install Energy Epoch  
4. Smoke: cold start, drill loop, roads, save/resume, background app, **home-screen icon**  

## App Store listing (before Submit)

| Field | Value |
|--------|--------|
| Privacy Policy | https://playenergyepoch.com/privacy |
| Support URL | https://playenergyepoch.com or mailto:landman@playenergyepoch.com |
| Category | Games → Simulation or Strategy |
| Price | Free |
| Screenshots | Capture from TestFlight device (6.7" + 6.1" required) |
| Description | Short pitch: oil ops sim, offline, free |

## Review notes (paste into ASC)

```text
Energy Epoch is a single-player offline oil & energy operations simulation.
No login is required to play. Optional web account features are not required
for App Review. All game logic runs on device.
```

## Rebuild after code changes

On Mac:

```bash
cd ~/energy-epoch
git pull
npm ci
npm run cap:sync
# Xcode → Product → Archive again
```

Web/marketing deploy is separate (Cloudflare on `main`) — see `PATH_W_DEPLOY.md`.  
iOS binary only updates when you **Archive + Upload** again (or later Xcode Cloud, once configured).

# Cloud Mac / Xcode session — Energy Epoch

Use this on a **rented Mac** after ASC + Bundle ID exist and the repo has `ios/`.

## Prerequisites

- [ ] Apple Developer membership **Active**
- [ ] App Store Connect app created (SKU, Bundle ID `com.playenergyepoch.app`)
- [ ] Repo cloned (branch with Capacitor, e.g. `graphics/pixi-atlas-v1`)
- [ ] Privacy URL works: https://playenergyepoch.com/privacy
- [ ] Listing fields from `IOS_ASC_LISTING_1.0.md` pasted into ASC (can finish before binary)
- [ ] Screenshots uploaded (at least `store-assets/ios/screenshots/iphone-6.7/*`)

## One-time on the Mac

1. Install **Xcode** from Mac App Store; open once, accept license, install components.  
2. Xcode → Settings → Accounts → add your **Apple ID** (Developer team).  
3. Terminal:

```bash
cd energy-epoch   # or your clone path
npm ci
npm run cap:sync
npm run cap:open:ios
```

## In Xcode

1. Select the **App** target → **Signing & Capabilities**  
2. **Team:** your personal/company team  
3. Bundle Identifier: `com.playenergyepoch.app` (must match ASC)  
4. Deployment: iOS **15.0** or higher (adjust if needed)  
5. Destination: Any iOS Device (or connected iPhone)  
6. **Product → Archive**  
7. Organizer → **Distribute App** → **App Store Connect** → Upload  

## After upload

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → your app → **TestFlight**  
2. Wait for processing (often 5–30 min)  
3. Internal Testing → add yourself → install **TestFlight** on iPhone → install Energy Epoch  
4. Smoke: cold start, drill loop, roads, save/resume, background app  

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

On Mac (or Windows then re-sync):

```bash
npm run cap:sync
# then Archive again in Xcode
```

On Windows only: `npm run cap:sync` updates `ios/App/App/public`; commit and pull on Mac.

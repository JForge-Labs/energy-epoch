# App Store Connect — human checklist (Windows + Mac)

Do these in order. Engineering repo work is already on the Capacitor path.

## A. Apple account (browser, any OS)

- [ ] [developer.apple.com/account](https://developer.apple.com/account) membership **Active**
- [ ] [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Agreements, Tax, and Banking** complete
- [ ] **Identifiers** → App ID explicit: `com.playenergyepoch.app`
- [ ] **My Apps** → New App  
  - Name: Energy Epoch  
  - Bundle ID: `com.playenergyepoch.app`  
  - SKU: `energy-epoch-ios-001`  
  - Platforms: iOS  
  - Primary language: English (U.S.)

## B. Listing content (no binary yet)

Paste from `IOS_ASC_LISTING_1.0.md`:

- [ ] Privacy Policy URL: `https://playenergyepoch.com/privacy`
- [ ] Support + Marketing: `https://playenergyepoch.com`
- [ ] Category: Games → Simulation
- [ ] Price: Free
- [ ] Promotional text + description + keywords
- [ ] Copyright: `2026 John Fodchuk` (or legal entity)
- [ ] App Privacy: **Data Not Collected** (native offline 1.0)
- [ ] Age rating questionnaire (see listing doc)
- [ ] Sign-in required: **No**
- [ ] Screenshots: upload `store-assets/ios/screenshots/iphone-6.7/` (landscape 2796×1290)
- [ ] Optional: also upload `iphone-6.5/`

Regenerate shots on Windows anytime:

```bash
npm run store:seed
npm run dev          # other terminal
npm run store:shots -- --headless
```

## C. Mac / cloud Mac (binary)

Follow `IOS_MAC_SESSION.md`:

```bash
npm ci
npm run cap:sync
npm run cap:open:ios
```

- [ ] Signing team selected; Archive → App Store Connect
- [ ] TestFlight internal install on your iPhone
- [ ] Smoke: cold start, drill/haul loop, save, background/resume, Export/Import
- [ ] Submit for Review + paste Review Notes from listing doc
- [ ] Prefer **manual release** after approval

## Bundle / product freeze

| Field | Value |
|-------|--------|
| Bundle ID | `com.playenergyepoch.app` |
| Display name | Energy Epoch |
| Version | 1.0 |
| Devices | **iPhone only** |
| Orientation | **Landscape only** |
| Engine | Path W Capacitor (not Unity) |

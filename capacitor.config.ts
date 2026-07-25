import type { CapacitorConfig } from "@capacitor/cli";

/**
 * iOS App Store shell for Energy Epoch.
 * Bundle ID must match App Store Connect + Developer Identifiers.
 * Build: npm run build && npm run cap:sync
 * Open on a Mac: npm run cap:open:ios
 */
const config: CapacitorConfig = {
  appId: "com.playenergyepoch.app",
  appName: "Energy Epoch",
  webDir: "dist",
  server: {
    // Packaged app loads local dist/ only (offline after install).
    androidScheme: "https",
    iosScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#0d1109",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0d1109",
    },
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    // Allows Apple Pencil / multitouch without browser chrome quirks.
    scrollEnabled: false,
  },
};

export default config;

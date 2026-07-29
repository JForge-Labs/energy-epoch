/**
 * Capacitor on Windows writes Package.swift path deps with backslashes:
 *   path: "..\\..\\..\\node_modules\\@capacitor\\app"
 * Swift treats `\` as escapes → "invalid escape sequence" on Mac / Xcode Cloud.
 * Rewrite to POSIX separators after every `cap sync ios`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "ios", "App", "CapApp-SPM", "Package.swift");

if (!fs.existsSync(pkgPath)) {
  console.warn("[fix-ios-spm-paths] Package.swift not found, skip");
  process.exit(0);
}

const before = fs.readFileSync(pkgPath, "utf8");
// Only rewrite path: "..." string contents that contain backslashes.
const after = before.replace(
  /path:\s*"([^"]*)"/g,
  (_m, p) => `path: "${String(p).replace(/\\/g, "/")}"`,
);

if (after === before) {
  console.log("[fix-ios-spm-paths] Package.swift paths already POSIX");
} else {
  fs.writeFileSync(pkgPath, after, "utf8");
  console.log("[fix-ios-spm-paths] Normalized Windows path separators in Package.swift");
}

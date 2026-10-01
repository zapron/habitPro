#!/usr/bin/env node
/**
 * Syncs the app's version across every file that carries a copy of it, so a
 * bump never drifts the way it did twice on 2026-10-01: package.json and
 * package-lock.json were left at the old semver version after app.json and
 * android/app/build.gradle moved on, and separately, android/app/build.gradle
 * itself was missed after an app.json version bump (that file is gitignored,
 * so `git diff` never surfaces it as a reminder). See docs/CURRENT_WORK.md /
 * agent.md "Production version bumps" for the full story.
 *
 * This script is the fix: run it instead of hand-editing each file.
 *
 * Usage:
 *   node scripts/sync-app-version.mjs --version 1.1.38
 *     Bumps the semver version (app.json expo.version + runtimeVersion,
 *     package.json, package-lock.json, android/app/build.gradle versionName).
 *
 *   node scripts/sync-app-version.mjs --version 1.1.38 --no-runtime
 *     Same, but leaves app.json's runtimeVersion untouched — use this when
 *     only one platform needs a new native build and you don't want to
 *     orphan the other platform's OTA channel from a runtimeVersion bump it
 *     doesn't actually need (the JS bundle itself hasn't changed).
 *
 *   node scripts/sync-app-version.mjs --android-code 40
 *     Bumps Android's versionCode only (app.json + build.gradle) — e.g. a
 *     native-asset-only fix (icons, permissions) that needs a new Play
 *     Console upload but no semver/runtimeVersion change.
 *
 *   node scripts/sync-app-version.mjs --ios-build 39
 *     Bumps iOS's buildNumber only (app.json).
 *
 *   Flags combine freely, e.g.:
 *   node scripts/sync-app-version.mjs --version 1.1.38 --android-code 40 --ios-build 39
 *
 * Everything here is a local file edit only — review with `git diff` and
 * commit yourself. android/app/build.gradle is gitignored, so it won't show
 * up there; this script printing its own before/after is the only record
 * you'll see that it changed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = { noRuntime: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--version") out.version = argv[++i];
    else if (a === "--android-code") out.androidCode = argv[++i];
    else if (a === "--ios-build") out.iosBuild = argv[++i];
    else if (a === "--no-runtime") out.noRuntime = true;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

function readFile(p) {
  return fs.readFileSync(p, "utf8");
}
function writeFile(p, content) {
  fs.writeFileSync(p, content, "utf8");
}

function replaceOnce(content, pattern, replacement, label) {
  const match = content.match(pattern);
  if (!match) {
    console.warn(`  ! pattern not found, skipped: ${label}`);
    return content;
  }
  return content.replace(pattern, replacement);
}

const args = parseArgs(process.argv.slice(2));
if (!args.version && !args.androidCode && !args.iosBuild) {
  console.error(
    "Nothing to do — pass at least one of --version, --android-code, --ios-build.\n" +
      "See the comment at the top of this script for usage examples.",
  );
  process.exit(1);
}

const appJsonPath = path.join(root, "app.json");
const packageJsonPath = path.join(root, "package.json");
const packageLockPath = path.join(root, "package-lock.json");
const gradlePath = path.join(root, "android", "app", "build.gradle");

console.log("Syncing app version across files...\n");

// --- app.json ---
let appJson = readFile(appJsonPath);
const appJsonData = JSON.parse(appJson);

if (args.version) {
  console.log(`app.json: version ${appJsonData.expo.version} -> ${args.version}`);
  appJson = replaceOnce(
    appJson,
    new RegExp(`"version":\\s*"${appJsonData.expo.version.replace(/\./g, "\\.")}"`),
    `"version": "${args.version}"`,
    "expo.version",
  );
  if (!args.noRuntime) {
    console.log(`app.json: runtimeVersion ${appJsonData.expo.runtimeVersion} -> ${args.version}`);
    appJson = replaceOnce(
      appJson,
      new RegExp(`"runtimeVersion":\\s*"${appJsonData.expo.runtimeVersion.replace(/\./g, "\\.")}"`),
      `"runtimeVersion": "${args.version}"`,
      "expo.runtimeVersion",
    );
  } else {
    console.log("app.json: runtimeVersion left untouched (--no-runtime)");
  }
}

if (args.androidCode) {
  console.log(`app.json: android.versionCode ${appJsonData.expo.android.versionCode} -> ${args.androidCode}`);
  appJson = replaceOnce(
    appJson,
    new RegExp(`"versionCode":\\s*${appJsonData.expo.android.versionCode}\\b`),
    `"versionCode": ${args.androidCode}`,
    "expo.android.versionCode",
  );
}

if (args.iosBuild) {
  console.log(`app.json: ios.buildNumber ${appJsonData.expo.ios.buildNumber} -> ${args.iosBuild}`);
  appJson = replaceOnce(
    appJson,
    new RegExp(`"buildNumber":\\s*"${appJsonData.expo.ios.buildNumber}"`),
    `"buildNumber": "${args.iosBuild}"`,
    "expo.ios.buildNumber",
  );
}
writeFile(appJsonPath, appJson);

// --- package.json / package-lock.json (semver only) ---
if (args.version) {
  let pkg = readFile(packageJsonPath);
  const pkgData = JSON.parse(pkg);
  console.log(`package.json: version ${pkgData.version} -> ${args.version}`);
  pkg = replaceOnce(
    pkg,
    new RegExp(`"version":\\s*"${pkgData.version.replace(/\./g, "\\.")}"`),
    `"version": "${args.version}"`,
    "package.json version",
  );
  writeFile(packageJsonPath, pkg);

  let lock = readFile(packageLockPath);
  const lockData = JSON.parse(lock);
  const oldLockVersion = lockData.version;
  console.log(`package-lock.json: version ${oldLockVersion} -> ${args.version} (root + packages[""])`);
  const escapedOld = oldLockVersion.replace(/\./g, "\\.");
  // Root "version" and packages[""].version are the first two occurrences of
  // this exact old version string at the top of the file (package-lock.json
  // doesn't otherwise use the app's own version string elsewhere).
  lock = lock.replace(
    new RegExp(`"version":\\s*"${escapedOld}"`, "g"),
    (full, offset) => (offset < 400 ? `"version": "${args.version}"` : full),
  );
  writeFile(packageLockPath, lock);
}

// --- android/app/build.gradle ---
if (fs.existsSync(gradlePath)) {
  let gradle = readFile(gradlePath);
  const codeMatch = gradle.match(/versionCode\s+(\d+)/);
  const nameMatch = gradle.match(/versionName\s+"([^"]+)"/);
  if (args.androidCode && codeMatch) {
    console.log(`android/app/build.gradle: versionCode ${codeMatch[1]} -> ${args.androidCode}`);
    gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${args.androidCode}`);
  }
  if (args.version && nameMatch) {
    console.log(`android/app/build.gradle: versionName "${nameMatch[1]}" -> "${args.version}"`);
    gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${args.version}"`);
  }
  writeFile(gradlePath, gradle);
} else {
  console.warn(
    "  ! android/app/build.gradle not found (no local prebuild present) — nothing to sync there right now; it'll need this same treatment whenever it's regenerated.",
  );
}

console.log(
  "\nDone. android/app/build.gradle is gitignored and won't show in `git status` —\n" +
    "the lines above are your only record it changed. Review the rest with `git diff` before committing.",
);

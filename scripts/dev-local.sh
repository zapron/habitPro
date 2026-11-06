#!/usr/bin/env bash
# Local dev only: one command that gets the iOS Simulator and the Android
# Emulator running the latest code against the local Supabase.
#
#   npm run dev:local                    # usual: start everything, open both apps
#   npm run dev:local -- --rebuild-ios   # after a native change (new library, app.json plugin)
#   npm run dev:local -- --rebuild-android
#
# Both simulators reach the Mac through 127.0.0.1 (Android via `adb reverse`),
# so a new WiFi IP, or no WiFi at all, doesn't break anything. This writes
# 127.0.0.1 into .env.local. A real phone can't use 127.0.0.1; for that use
# `npm start`, which writes the LAN IP back.
#
# Xcode 27 notes (why this isn't just `expo run:ios`): there is no
# Simulator.app any more (DeviceHub replaced it, and `expo run:ios` looks for
# Simulator), and apps built with it crash on the iOS 27 simulator, so this
# always uses an iOS 26 iPhone.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REBUILD_IOS=0
REBUILD_ANDROID=0
for arg in "$@"; do
  case "$arg" in
    --rebuild-ios) REBUILD_IOS=1 ;;
    --rebuild-android) REBUILD_ANDROID=1 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

BUNDLE_ID="com.rakti.habitpro"
SIM_NAME="${SIM_NAME:-iPhone 17 Pro}"
SIM_RUNTIME_PREFIX="com.apple.CoreSimulator.SimRuntime.iOS-26"
DEVICEHUB="/Applications/Xcode.app/Contents/Applications/DeviceHub.app"
LOCAL_URL="http://127.0.0.1"
DEV_LINK="exp+habitpro://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"

step() { printf '\n\033[1;32m▶ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$1"; }

# 1. Local Supabase
step "Local Supabase"
if ! docker info >/dev/null 2>&1; then
  echo "Starting Docker…"
  open -a Docker
  until docker info >/dev/null 2>&1; do sleep 2; done
fi
if docker ps --format '{{.Names}}' | grep -q '^supabase_db_habitPro$'; then
  echo "Already running."
else
  npx supabase@2 start
fi

# 2. iOS Simulator
step "iOS Simulator ($SIM_NAME, iOS 26)"
SIM_ID="$(xcrun simctl list devices available -j | node -e '
  const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const [name, prefix] = process.argv.slice(1);
  for (const [runtime, devices] of Object.entries(data.devices)) {
    if (!runtime.startsWith(prefix)) continue;
    const d = devices.find((x) => x.name === name);
    if (d) { console.log(d.udid); process.exit(0); }
  }' "$SIM_NAME" "$SIM_RUNTIME_PREFIX")"
if [ -z "$SIM_ID" ]; then
  echo "No '$SIM_NAME' with an iOS 26 runtime. Install one in Xcode → Settings → Components."
  exit 1
fi
# Shut down any other booted iPhone (the iOS 27 one crashes the app).
for other in $(xcrun simctl list devices booted | grep -oE '[0-9A-F-]{36}' || true); do
  [ "$other" != "$SIM_ID" ] && xcrun simctl shutdown "$other" || true
done
xcrun simctl bootstatus "$SIM_ID" -b >/dev/null
open -a "$DEVICEHUB"

if [ "$REBUILD_IOS" = 1 ] || ! xcrun simctl get_app_container "$SIM_ID" "$BUNDLE_ID" >/dev/null 2>&1; then
  step "Building the iOS app (a few minutes)"
  if [ ! -d ios ]; then npx expo prebuild -p ios; fi
  (cd ios && pod install)
  xcodebuild -workspace ios/habitPro.xcworkspace -scheme habitPro -configuration Debug \
    -destination "id=$SIM_ID" -derivedDataPath ios/build/dd build -quiet
  xcrun simctl install "$SIM_ID" ios/build/dd/Build/Products/Debug-iphonesimulator/habitPro.app
fi

# 3. Android Emulator
ANDROID_ID="$(adb devices 2>/dev/null | awk '/^emulator-[0-9]+\tdevice/{print $1; exit}')"
if [ -n "$ANDROID_ID" ]; then
  step "Android Emulator ($ANDROID_ID)"
  adb -s "$ANDROID_ID" reverse tcp:8081 tcp:8081 >/dev/null
  adb -s "$ANDROID_ID" reverse tcp:54321 tcp:54321 >/dev/null
  if [ "$REBUILD_ANDROID" = 1 ]; then
    step "Building the Android app (a few minutes)"
    npx expo run:android --no-bundler --device "$ANDROID_ID"
  fi
else
  warn "No Android Emulator running; start one from Android Studio and run this again to include it."
fi

# 4. Metro
step "Metro"
OLD_METRO="$(lsof -tiTCP:8081 -sTCP:LISTEN || true)"
if [ -n "$OLD_METRO" ]; then
  echo "Stopping the old Metro ($OLD_METRO)."
  kill $OLD_METRO 2>/dev/null || true
  sleep 1
fi

# Open both apps once Metro is up.
(
  until curl -s "$LOCAL_URL:8081/status" | grep -q running; do sleep 1; done
  xcrun simctl terminate "$SIM_ID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl openurl "$SIM_ID" "$DEV_LINK"
  if [ -n "$ANDROID_ID" ]; then
    adb -s "$ANDROID_ID" shell am force-stop "$BUNDLE_ID" >/dev/null 2>&1 || true
    adb -s "$ANDROID_ID" shell am start -a android.intent.action.VIEW -d "'$DEV_LINK'" >/dev/null
  fi
  printf '\n\033[1;32m✔ Apps opened. Press r here to reload both after a code change.\033[0m\n'
) &

# Point the app at 127.0.0.1. This has to be written into .env.local: Expo
# reloads .env files while Metro runs and they win over a shell variable.
# `npm start` puts the LAN IP back (scripts/sync-local-supabase-ip.mjs).
sed -i '' -E "s#^EXPO_PUBLIC_SUPABASE_URL=http://[0-9.]+:54321#EXPO_PUBLIC_SUPABASE_URL=$LOCAL_URL:54321#" .env.local
exec npx expo start --dev-client -c

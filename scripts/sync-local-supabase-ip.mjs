#!/usr/bin/env node
/**
 * Local dev only. `.env.local` points EXPO_PUBLIC_SUPABASE_URL at this Mac's LAN
 * IP (not 127.0.0.1) so the same value works from the iOS Simulator, the Android
 * Emulator, and a physical device on the same WiFi — see docs/CURRENT_WORK.md.
 * That IP drifts on WiFi reconnect/DHCP renewal, which then looks like a generic
 * "network request failed" in the app with no obvious cause. Runs automatically
 * before `start`/`android`/`ios` (see package.json's pre* hooks) so it self-heals
 * instead of needing a manual fix every time.
 */
import { networkInterfaces } from "node:os";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(repoRoot, ".env.local");

function currentLanIp() {
  const nets = networkInterfaces();
  // Prefer common macOS WiFi/Ethernet interface names, but fall back to
  // scanning everything so this doesn't silently no-op on an unusual setup.
  const preferredOrder = ["en0", "en1", ...Object.keys(nets)];
  const seen = new Set();
  for (const name of preferredOrder) {
    if (seen.has(name) || !nets[name]) continue;
    seen.add(name);
    for (const entry of nets[name]) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return null;
}

function main() {
  if (!existsSync(envPath)) {
    console.warn("[sync-local-supabase-ip] .env.local not found — skipping (nothing to patch).");
    return;
  }

  const ip = currentLanIp();
  if (!ip) {
    console.warn("[sync-local-supabase-ip] Could not detect a LAN IP — leaving .env.local as-is.");
    return;
  }

  const contents = readFileSync(envPath, "utf8");
  const lineRegex = /^EXPO_PUBLIC_SUPABASE_URL=http:\/\/[\d.]+:54321\s*$/m;
  const match = contents.match(lineRegex);
  if (!match) {
    console.warn(
      "[sync-local-supabase-ip] No EXPO_PUBLIC_SUPABASE_URL=http://<ip>:54321 line found — leaving .env.local as-is.",
    );
    return;
  }

  const newLine = `EXPO_PUBLIC_SUPABASE_URL=http://${ip}:54321`;
  if (match[0].trim() === newLine) {
    console.log(`[sync-local-supabase-ip] LAN IP unchanged (${ip}).`);
    return;
  }

  const updated = contents.replace(lineRegex, newLine);
  writeFileSync(envPath, updated);
  console.log(`[sync-local-supabase-ip] Updated .env.local: ${match[0].trim()} -> ${newLine}`);
}

main();

// One-off maintenance script: re-compresses the ~161 oversized files already
// sitting in the streak-memories bucket (originals that slipped past the
// app's normal compression pipeline — see streakMemoryStorage.ts's fallback
// comment). Not part of the app; run manually, once, from a dev machine.
//
// Requires (env vars, NOT the app's .env — service role key must never be
// anywhere near the app bundle):
//   SUPABASE_URL                 e.g. https://glriwmxkpfubbyzoyzdk.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    from Supabase Dashboard > Project Settings > API
//
// Usage:
//   npm install --no-save sharp   (one-time, not an app dependency)
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/compact-streak-memories.mjs --dry-run
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/compact-streak-memories.mjs --apply

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUCKET = "streak-memories";
const MAX_WIDTH = 1280;
const JPEG_QUALITY = 78;

const apply = process.argv.includes("--apply");
if (!apply && !process.argv.includes("--dry-run")) {
  console.log("Pass --dry-run to preview, or --apply to actually re-upload.");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const manifest = JSON.parse(
  readFileSync(path.join(__dirname, "compact-streak-memories.manifest.json"), "utf8"),
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${manifest.length} files to process\n`);

  let totalBefore = 0;
  let totalAfter = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, entry] of manifest.entries()) {
    const { name: objectPath, size_bytes: originalSize } = entry;
    process.stdout.write(`[${i + 1}/${manifest.length}] ${objectPath} (${(originalSize / 1024).toFixed(0)} KB) `);

    try {
      const { data: blob, error: downloadErr } = await supabase.storage.from(BUCKET).download(objectPath);
      if (downloadErr || !blob) {
        console.log(`SKIP (download failed: ${downloadErr?.message ?? "no data"})`);
        skipped += 1;
        continue;
      }

      const inputBuffer = Buffer.from(await blob.arrayBuffer());
      const outputBuffer = await sharp(inputBuffer)
        .rotate() // apply EXIF orientation before resize, then strip it
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();

      totalBefore += originalSize;

      if (outputBuffer.length >= originalSize) {
        console.log(`SKIP (recompressed ${(outputBuffer.length / 1024).toFixed(0)} KB is not smaller)`);
        totalAfter += originalSize;
        skipped += 1;
        continue;
      }

      const savedKb = ((originalSize - outputBuffer.length) / 1024).toFixed(0);
      totalAfter += outputBuffer.length;

      if (!apply) {
        console.log(`WOULD SAVE ${savedKb} KB (-> ${(outputBuffer.length / 1024).toFixed(0)} KB)`);
        continue;
      }

      const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(objectPath, outputBuffer, {
        upsert: true,
        contentType: "image/jpeg",
      });
      if (uploadErr) {
        console.log(`FAIL (upload: ${uploadErr.message})`);
        failed += 1;
        continue;
      }
      console.log(`OK, saved ${savedKb} KB`);
    } catch (e) {
      console.log(`FAIL (${e instanceof Error ? e.message : String(e)})`);
      failed += 1;
    }

    await sleep(120);
  }

  console.log("\n--- Summary ---");
  console.log(`Processed: ${manifest.length}, skipped: ${skipped}, failed: ${failed}`);
  console.log(`Before: ${(totalBefore / 1024 / 1024).toFixed(1)} MB`);
  console.log(`After:  ${(totalAfter / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Saved:  ${((totalBefore - totalAfter) / 1024 / 1024).toFixed(1)} MB`);
  if (!apply) {
    console.log("\nThis was a dry run — nothing was uploaded. Re-run with --apply to actually compact.");
  }
}

main();

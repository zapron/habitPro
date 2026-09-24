// `supabase db reset` wipes `auth.users` on every run (the data snapshot in
// supabase/seed.sql is a --schema public dump, so it can restore `profiles`/`habits`
// rows but never the auth user those rows point at). Without this, every local reset
// silently breaks sign-in for the real dev account and the second test account used to
// exercise the request-to-join flow — wired as postdb:reset so it just always happens.
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

const DEV_PASSWORD = "devTest123";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const DEV_USERS = [
  {
    id: "f90d8ca4-ad7c-4ca8-9646-4633af4a53b3",
    email: "raktim24@gmail.com",
    username: "raktim_24",
  },
  {
    id: "00000000-0000-4000-8000-000000000001",
    email: "requester@example.com",
    username: "test_friend",
  },
];

function localSupabaseStatus() {
  const raw = execSync("npx supabase status -o json", {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: ["ignore", "pipe", "ignore"],
  }).toString();
  return JSON.parse(raw);
}

async function ensureAuthUser(admin, user) {
  const { error: createError } = await admin.auth.admin.createUser({
    id: user.id,
    email: user.email,
    password: DEV_PASSWORD,
    email_confirm: true,
  });
  if (!createError) {
    console.log(`  created auth user ${user.email}`);
    return;
  }
  const alreadyExists = /already been registered|already exists/i.test(createError.message);
  if (!alreadyExists) throw createError;
  console.log(`  auth user ${user.email} already exists, leaving as-is`);
}

async function ensurePremiumProfile(admin, user) {
  const premiumExpiresAt = new Date(Date.now() + ONE_YEAR_MS).toISOString();
  const { error } = await admin.from("profiles").upsert(
    {
      id: user.id,
      username: user.username,
      is_premium: true,
      premium_expires_at: premiumExpiresAt,
      premium_source: "admin",
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  console.log(`  profile ${user.username}: premium through ${premiumExpiresAt}`);
}

async function main() {
  let status;
  try {
    status = localSupabaseStatus();
  } catch {
    console.log("Local Supabase isn't running (npm run db:start) — skipping dev user seed.");
    return;
  }

  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const user of DEV_USERS) {
    console.log(`Seeding ${user.email} (${user.id})`);
    await ensureAuthUser(admin, user);
    await ensurePremiumProfile(admin, user);
  }

  console.log(`Done. Both accounts use password: ${DEV_PASSWORD}`);
}

main().catch((err) => {
  console.error("seed-local-dev-users failed:", err.message ?? err);
  process.exitCode = 1;
});

# Paid Repair (Photo Repair): Plan

Status (2026-11-13): **planned, nothing built.** No code, migration, store product or RevenueCat product exists yet. Decisions in section 4 are still open; settle them with the user before writing code.

Earlier mention: `docs/FUTURE_AGENT_HANDOFF.md` listed "Photo Repair: a paid ₹10 repair that adds photos and counts toward Chapters" as paused.

## 1. What the user wants

- A missed day can be repaired by paying. The window stays as today: only the day just missed, within 24 hours after it ended.
- Flow: tap repair, pay, the day unlocks.
- An unlocked day works like a normal day: the user adds photos and notes, and can post that day to Community again.
- Chapters: today any repair breaks the 7-day Chapter run. With a paid repair the run should either continue, or the Chapter rule has to change (see decision D2).

## 2. What exists today

### Repair

- **Eligibility is client-only:** `src/utils/streakRepairEligibility.ts`.
  - Only the previous mission day, and only within `STREAK_REPAIR_WINDOW_HOURS = 24` after that day ended (in the habit's time zone).
  - Never a day before `joinedChallengeAt`.
  - Not if the mission has no completed day yet.
- **Solo repair** goes through `rpc_request_streak_repair`; the latest version is in `20260630120000_lone_group_streak_repair_fallback.sql`. It does these steps:
  1. Deducts XP (cost 40/80/120/180 by streak, `getStreakRepairXpCost`).
  2. Inserts a `streak_repairs` row with status `applied`.
  3. Appends the date to `completed_dates` via `_rpc_append_habit_completed_date`.
  4. Writes the stock memory note "Streak repaired." with `repairSource: 'solo'` via `_rpc_merge_repair_streak_memory`.
- **Group repair:**
  - Premium only.
  - The repair is `pending` until 2 squad approvals arrive; a single decline declines it.
  - In a squad of one, it applies straight away (the "lone group" fallback).
- **Table:** `streak_repairs` with `unique (user_id, habit_id, date_str)`. There is no `kind` column.
- **UI:**
  - `src/components/StreakRepairSheet.tsx`, opened from `app/habit/[id].tsx` (`eligibleRepair`, `repairSheetOpen`).
  - The day grid shows a hammer icon for repaired days.
- **`repairSource` on a streak memory:**
  - Counts as completion evidence in `habitStore.ts`, `sync.ts` (`habitFromRow`) and `app/habit/[id].tsx`.
  - See the "changing what a field means" caution in `app-architecture.md` before adding a new value.

### Chapters

- **Server:** `rpc_claim_video_moment_v1` (`20261108120000_chapter_rolling_week.sql`) raises `block_has_repair` when any `streak_repairs` row (applied or pending) falls inside the 7 dates.
- **Client:** `src/features/videoMoments/credit.ts` counts `memories[key]?.repairSource` as a repair and restarts the run the day after it.
- The two must stay in step.

### Payments

- RevenueCat via `react-native-purchases`; see `src/context/BillingContext.tsx`.
- **Subscriptions only:** `monthly` and `yearly` grant the entitlement `habitpro_community`.
- **Webhook:** `supabase/functions/revenuecat-webhook`.
  - Sets `profiles.is_premium` and the expiry.
  - Skips any product it doesn't know (`unrelated_product`).
- No consumable product, no purchase ledger, no server-side purchase verification beyond the webhook.

### Community

- Habit day posts are a client `upsert` into `community_wins` (`postCommunityWin` in `src/lib/communityWinsApi.ts`).
- RLS checks only that the row belongs to the user and that the user is Premium (`20260616123000_premium_social_rls.sql`).
- The win id is `habitwin:<habitId>:<date>`, with `streak_mission_day`.
- The server never checks the date, so the Chapter rule "at least 3 posts in the week" trusts the client.

## 3. Gaps found while reading

**Update 2026-11-14:** gaps 1-4 are fixed in migration `20261114120000_repair_and_post_server_checks.sql` (tested with local `db:reset`, **not pushed to production yet**). The details:
- XP cost now has a server floor of 40.
- The repair date must be the day just missed (up to 3 days back in the mission time zone, not before start or join, not already done).
- The 14-day cooldown constant was deleted, not enforced (it never applied).
- A new habit-day Community post for a day 2+ days back must be done; no future days.

The original list:

1. `rpc_request_streak_repair` takes `p_xp_cost` from the client and only checks that it is 0 or more, so a modified client could repair for 0 XP.
2. `STREAK_REPAIR_COOLDOWN_DAYS = 14` is defined but never used, in the app or on the server.
3. Repair eligibility (previous day, 24h window) is checked only in the app. The RPC accepts any date.
4. Community posts have no server date check (see above).
5. Not yet checked: whether the habit screen lets the user open the memory sheet (photo or note) for yesterday's date at all. Paid repair needs that, so check before building.

A paid product makes 1 and 3 matter more. The new paid RPC must do its own eligibility check on the server (see 5.2).

## 4. Decisions the user still has to make

| # | Question | Recommendation |
|---|----------|----------------|
| D1 | Price | ₹10. The lowest price tier differs between stores; check it in Play Console and App Store Connect. The store fee and tax come out of it. |
| D2 | Does a paid repair keep a Chapter run going? | **Yes, but only once the repaired day has a real photo or note** (not the stock note). XP repairs keep breaking Chapters. This was the earlier plan. |
| D3 | Who can buy | Anyone. Saving the streak and adding a photo works for everyone; posting to Community and Chapters stay Premium, as today. |
| D4 | Group missions: does paying skip the squad vote? | Yes. Money is the anti-abuse check. The squad sees an activity line ("X repaired day 5"). Alternative: keep the vote and charge only after approval, which is far more complex. |
| D5 | Keep the XP repair? | Yes, both. XP saves the streak only. Paid saves the streak and unlocks memories and Chapters. |
| D6 | Cooldown for paid repairs | None. The 24h window and one repair per date already limit it. |
| D7 | Refund after the repair was used | Keep the day repaired and mark the credit as refunded (log only). Undoing a used repair is risky and rare. |
| D8 | How long the repaired day stays editable | Until the end of the current mission day, matching how today's day works. |

## 5. Proposed architecture: a credit ledger

Payment and repair are two separate steps joined by a **repair credit**. If the app dies after payment, the money is never lost: the credit waits and can be used.

### 5.1 Store and RevenueCat (the user does the console steps; RevenueCat steps can be done through the RevenueCat MCP)

- Create one **consumable** product, for example `habitpro_day_repair`:
  - a Play Console in-app product;
  - an App Store Connect consumable (it needs a review screenshot).
- Import the product into RevenueCat. **Don't attach it to any entitlement.**
- Load it in the app with `Purchases.getProducts([id], PRODUCT_CATEGORY.NON_SUBSCRIPTION)` and buy it with `Purchases.purchaseStoreProduct`.
- The SDK is already native in runtime 1.1.40, so the app side can ship by OTA.
- Consumables can't be "restored". Our ledger is the record of what was bought.

### 5.2 Database (one migration; test it with local `npm run db:reset` first)

- **New table `repair_credits`**, one row per purchase:
  - columns: `id`, `user_id`, `store_transaction_id` (unique), `product_id`, `store`, `source` (`purchase` or `grant`), `status` (`available`, `used` or `refunded`), `purchased_at`, `used_repair_id`, `created_at`;
  - RLS lets the owner select only. No client writes.
- **`streak_repairs` changes:**
  - add `kind text not null default 'xp' check (kind in ('xp','paid'))`;
  - add `credit_id uuid references repair_credits`.
- **`rpc_use_paid_repair_v1(p_habit_id, p_date_str)`**, `security definer`, does these steps:
  1. Checks auth.
  2. Checks eligibility **on the server**: the date is the previous mission day in the habit's time zone, now is within 24h of that day's end, the date isn't already completed and isn't before the user joined. Use the same date logic as the Chapter RPC.
  3. Takes an advisory lock per user and habit.
  4. Takes the oldest `available` credit (`for update skip locked`).
  5. Inserts a `streak_repairs` row (`kind = 'paid'`, status `applied`, `xp_cost` 0).
  6. Appends the completed date.
  7. Merges the memory with `repairSource: 'paid'`.
  8. Marks the credit `used`.
  9. Returns the repair id.
  - Errors: `no_credit`, `outside_window`, `already_complete`, `already_repaired`.
- **Group:** if D4 is "yes", the same RPC applies the repair straight away for a group habit and writes a challenge activity row.
- **Chapters:** in `rpc_claim_video_moment_v1`, `block_has_repair` ignores `kind = 'paid'` rows whose day memory has a user photo or note (per D2). Mirror this in `credit.ts`.
- **Optional:** `rpc_my_repair_credits_v1()` returns the count of available credits for the UI.

### 5.3 Edge Functions

- **`revenuecat-webhook`:**
  - On `NON_RENEWING_PURCHASE` with the repair product id, insert a credit (`on conflict (store_transaction_id) do nothing`).
  - On `REFUND` for that product, mark the credit `refunded` (whether or not it was used, per D7).
  - Never touch `is_premium` for this product. Today this product would be skipped as `unrelated_product`, so this is a new branch.
- **New `claim-repair-purchase`:**
  - The app calls it right after a successful purchase, with the transaction id.
  - It asks the RevenueCat REST API (`GET /v1/subscribers/{app_user_id}`, secret key held as a function secret, never in the repo) whether that non-subscription transaction exists for this user.
  - If it does, it inserts the credit through the same idempotent insert.
  - Why: webhooks can arrive seconds or minutes late. The user shouldn't wait.
  - RevenueCat's `app_user_id` is already the Supabase user id.

### 5.4 App

- **Files:**
  - `src/lib/paidRepairApi.ts`: claim, use, list credits.
  - `BillingContext`: `loadRepairProduct()` (store-localized price) and `purchaseRepair()`.
- **`StreakRepairSheet`:** two choices:
  - "Use 80 XP · saves the streak";
  - "Repair with photos · ₹10 (store price)".
  - If a credit is already available, show "Use your repair" with no payment.
- **After a paid repair:** open the memory sheet for that date (photo, note, "Post to Community"). The post uses the repaired date's `streak_mission_day`.
- **`app/habit/[id].tsx`:** allow memory editing for a date with `repairSource === 'paid'` (D8).
- **Audit every reader of `repairSource` for the new `'paid'` value:**
  - `repairStreakMemoryMerge.ts`;
  - `credit.ts`;
  - the completion-evidence checks (`habitStore.ts`, `sync.ts`, `app/habit/[id].tsx`);
  - the day-grid icon (paid could show the photo, like a normal day);
  - Community and share cards.
- **Unused credit:** show a small banner, "You have 1 repair ready", when a credit exists. It is used on the next missed day.
- **Old app versions** don't know `'paid'`, so their `credit.ts` counts it as a repair and shows "no Chapter" while the server would allow it. Accept this or force an update; all the new app code can go by OTA on 1.1.40.

## 6. End-to-end cases

| Case | What happens |
|------|--------------|
| Happy path | Pay → claim function adds the credit → `rpc_use_paid_repair_v1` → day complete → memory sheet opens → photo → post. |
| App killed after paying | The credit is waiting (from the webhook or the next claim). On the next open the sheet says "Your repair is paid, apply it" while the window is open. |
| Window closes between paying and applying | The RPC raises `outside_window`. The credit stays for the next missed day. No refund needed. |
| Pending payment (slow UPI or card on Play) | Show "Payment pending". The webhook adds the credit later; the user applies it if still in the window, otherwise the credit is kept. |
| User cancels payment | Nothing changes. |
| Double tap or retry | The store blocks a second charge in flight; the credit insert is idempotent by transaction id; the repair is unique per date. |
| Day completed on another device meanwhile | The RPC raises `already_complete`. The credit is kept. |
| Already XP-repaired that day | `already_repaired`. The client hides the paid option. |
| Offline | The paid button is disabled. |
| Group habit | Per D4: applied straight away, plus an activity row. |
| Refund | The webhook marks the credit `refunded`; a used repair stays (D7). |
| Habit deleted after paying | Credits belong to the user, not the habit, so they survive. |
| Store account shared by two app accounts | Credits go to the RevenueCat `app_user_id`, the user who was signed in when buying. |
| Chapter week containing a paid day | Counts once the day has a real photo or note (D2); server and `credit.ts` agree. |

## 7. Build order

1. Get D1-D8 answered.
2. Store products (user), then the RevenueCat product (MCP or dashboard).
3. Migration: table, columns, RPC, Chapter RPC change. Test with local `db:reset` and SQL tests for each error case.
4. Edge Functions: the webhook branch plus `claim-repair-purchase`. Test locally with `supabase functions serve` and RevenueCat sandbox. For UI work without real payments, insert a `grant` credit with SQL in the local DB.
5. App: sheet, purchase, memory editing on the repaired day, `repairSource` audit, credits banner.
6. Sandbox purchases on real devices: Play license tester, TestFlight sandbox.
7. Production, in this order:
   1. The user runs `ship:production` (migration).
   2. Deploy the functions.
   3. Set the RevenueCat secret as a function secret.
   4. OTA.

Rough size: 3-5 working sessions. Store review of the new product can add days.

# Testing group habit challenges

These steps assume Supabase is configured (`.env` with URL and anon key), the migration `20260411120000_group_habit_challenges.sql` has been applied (`npm run db:push` or equivalent), and the app runs with `npx expo start`.

## Two test accounts

1. Create two users (e.g. `alice@…` and `bob@…`) via sign-up, or use the Supabase dashboard.
2. Each account uses its **sign-up email** for invite search (prefix match in the group challenge sheet). No separate username is required.

## Creator flow

1. Sign in as Alice.
2. Create a habit (or use an existing one) and open its detail screen.
3. Tap the **group challenge** icon (people) in the header.
4. Tap **Start group challenge**. This creates a `challenge_groups` row, links your habit, and adds you as **creator** in `challenge_members`.
5. In the sheet, type at least three characters of Bob’s **email** and tap **Invite**. Bob should receive a row in `challenge_invites` and a **notification** (`challenge_invite`).

## Invitee flow

1. Sign in as Bob.
2. Open **Compete**. Pending invites appear at the top under **GROUP INVITES**.
3. Tap **Accept**. The app creates a new local habit from the challenge template, syncs it to `habits`, then inserts `challenge_members` and marks the invite **accepted**.
4. Open **Profile →** bell icon **Notifications** to see entries; tapping an invite notification routes to **Compete**.

## Cohort visibility

1. As Alice or Bob, open the challenge from the habit sheet (**Open challenge**) or navigate to `/challenge/<challenge_id>`.
2. After both users have synced, you should see **cohort** progress for the other member’s habit (read-only), pulled into `cohortPeerHabits` via sync.

## Decline

1. Send another invite from a new group, or reuse a test invite.
2. As invitee, tap **Decline** on the Compete card. The invite status becomes **declined** and the card disappears.

## Troubleshooting

- **Search returns no users**: Apply migration `search_users_by_email_prefix` (`npm run db:push`); search needs at least three characters of the invitee’s **auth email**.
- **Accept fails after “Could not join”**: Ensure sync completed (watch sync toast / logs). The habit row must exist on the server before `challenge_members` is inserted.
- **Empty cohort**: Pull runs on sign-in; focus the challenge screen or navigate away and back to trigger `refreshCohortPeerHabits`.

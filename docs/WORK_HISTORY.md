# HabitPro Work History

This is a concise chronological log for future sessions. Keep secrets out of this file.

## 2026-07-17

### Commits

- `075cabe feat: add daily wisdom launch splash`
- `5131c7a feat: show cohort streak dots newest first`

### What Changed

- Daily Wisdom moved from mission detail into the existing habitPro launch splash.
- `AnimatedSplashOverlay` now shows a deterministic daily quote below the habitPro lockup.
- `SplashGate` waits for a short minimum launch window and signed-in startup readiness when available.
- Notification permission nudge delay was increased to avoid colliding with launch wisdom.
- Mission detail `QuoteCard` was removed.
- Cohort participant dots now show current/reached day first and omit future/unreached dots.

### Validation

- `npx tsc --noEmit` passed.
- `git diff --check` passed.
- `cmd /c npx expo export --platform ios --output-dir .expo-export-check` passed and the export folder was removed.

### OTA

- Preview OTA command attempted:

```bash
cmd /c npm run update:preview -- --message "Preview daily wisdom splash and cohort timeline"
```

- The sandbox blocked the EAS publish/network escalation. Run locally when needed.

### Open Investigation

- Android S24 Ultra shows Home jank after splash and delayed mission-detail touches.
- User clarified splash itself is not the visible problem; the issue starts after Home appears.
- Current suspected Home culprit: `src/components/HabitCard.tsx` `RingDayArcs`, which renders one SVG `Circle` per mission day.
- Current suspected detail culprits: Active Trail cells and `StreakMemoryGallery` honeycomb SVG/image mounting.
- Recommended next step: run an Android-only experiment replacing long-mission Home segmented rings with a lightweight progress ring/text.

### Documentation / Handoff Audit

- Updated `agent.md`, `docs/CURRENT_WORK.md`, `docs/FUTURE_AGENT_HANDOFF.md`, `docs/PROJECT_CONTEXT.md`, `docs/IOS_BUILD_PLAYBOOK.md`, and `app-architecture.md`.
- Added `docs/MAC_SETUP_HANDOFF.md` for Windows-to-Mac migration.
- Added this `docs/WORK_HISTORY.md` file for chronological session history.
- Added repo-local skill `.codex/skills/habitpro-session-logger/` for end-of-session handoff logging.

### Documentation Validation

- `npx tsc --noEmit` passed.
- `git diff --check` passed with Windows line-ending warnings only.
- Skill validator was attempted, but `quick_validate.py` could not run because the local Python environment is missing the `yaml` module.

## 2026-07-16

### Commits

- `1ecb823 feat: virtualize mission moment honeycomb`
- `f94bacf perf: smooth mission detail rendering`
- `d1fc011 style: compact mission detail cards`
- `2884de9 docs: add project handoff context`

### What Changed

- Mission moment gallery became a virtualized two-row honeycomb using horizontal `FlashList` columns.
- Mission detail performance was improved through Active Trail batching and non-blocking decorative animations.
- Supporting mission detail cards were made more compact.
- Core handoff docs were added to make future sessions resumable.

### Cautions

- Avoid reintroducing `react-native-reanimated` in `StreakMemoryGallery` while Expo Go Worklets versions may mismatch.
- Keep honeycomb virtualized; do not return to mounting every moment in a plain horizontal `ScrollView`.

## Earlier July 2026

- Mini Mission Timer Check-In was added as the humane default.
- Timer Check-In expires into Complete / Retry / Fail review rather than immediately failing.
- Manual Finish remains the stricter mode and keeps reserve fuel / Live Squad behavior.
- Supabase migration `20260715120000_mini_timer_check_in.sql` must be applied before synced testing of those changes.

---
name: habitpro-performance-investigation
description: Use for HabitPro time/performance optimization, slow screen investigations, timer/check-in timing bugs, navigation latency, sync latency, or perceived wait-time work.
---

# HabitPro Performance Investigation

## Rule

When optimizing time, latency, timers, or perceived speed, prefer evidence from targeted temporary timer logs before changing architecture.

## Workflow

1. Add narrow temporary timing instrumentation around the suspected path:
   - start/end timestamps with `Date.now()`
   - labels such as `[habitPro:perf] screen.action`
   - useful counts/flags only, never secrets or user content
2. Reproduce the slow path and compare timings.
3. Fix the slowest measured step first.
4. Re-run the timed path to confirm improvement.
5. Remove temporary `console.log` / `console.info` instrumentation before final handoff unless the user explicitly asks to keep it.

## Useful Temporary Snippets

```ts
const startedAt = Date.now();
try {
  // work
} finally {
  console.info(`[habitPro:perf] label ${Date.now() - startedAt}ms`);
}
```

```ts
const startedAt = Date.now();
console.info("[habitPro:perf] label.start");
InteractionManager.runAfterInteractions(() => {
  console.info(`[habitPro:perf] label.afterInteractions ${Date.now() - startedAt}ms`);
});
```

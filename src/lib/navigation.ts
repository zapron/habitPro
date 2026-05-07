import type { Href } from "expo-router";

type BackCapableRouter = {
  back: () => void;
  canGoBack?: () => boolean;
  replace: (href: Href) => void;
};

export function backOrReplace(router: BackCapableRouter, fallback: Href): void {
  try {
    if (router.canGoBack?.() === true) {
      router.back();
      return;
    }
  } catch {
    // Fall through to the deterministic fallback route.
  }
  router.replace(fallback);
}

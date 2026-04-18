/**
 * Tab bar vertical footprint — keep in sync with app/(tabs)/_layout.tsx
 * (used by toasts so they sit just above the bar).
 */
export const TAB_BAR_ROW_HEIGHT = 49;
export const TAB_BAR_BOTTOM_GAP = 14;

export function tabBarOuterHeight(bottomInset: number): number {
  return TAB_BAR_ROW_HEIGHT + bottomInset + TAB_BAR_BOTTOM_GAP;
}

import { useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tabBarOuterHeight } from "../constants/tabBar";

const GAP_ABOVE_TAB_BAR = 10;
const FULLSCREEN_BOTTOM_EXTRA = 16;

/**
 * Bottom padding for toast pills: above the tab bar on (tabs), or above
 * the home indicator on full-screen routes (habit, challenge, auth, etc.).
 */
export function useToastBottomPadding(): number {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const inTabs = segments[0] === "(tabs)";
  if (inTabs) {
    return tabBarOuterHeight(insets.bottom) + GAP_ABOVE_TAB_BAR;
  }
  return Math.max(insets.bottom, 12) + FULLSCREEN_BOTTOM_EXTRA;
}

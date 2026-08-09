import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import {
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
} from "@expo-google-fonts/dm-sans";

/** Pass to `useFonts({ ...fontAssets })` in root layout. */
export const fontAssets = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
};

/**
 * PostScript names from `@expo-google-fonts/plus-jakarta-sans` — use with `fontFamily`
 * (custom fonts do not reliably honor `fontWeight` on Android).
 */
export const fontFamily = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  /**
   * Manrope (display) + DM Sans (body) — the pairing from the "habitPro light
   * mode redesign" Claude Design mockup. Additive/opt-in only: set explicitly
   * via `style.fontFamily` at a call site (`AppText` passes an explicit family
   * through untouched); nothing switches over to these automatically.
   */
  manropeSemibold: "Manrope_600SemiBold",
  manropeBold: "Manrope_700Bold",
  manropeExtraBold: "Manrope_800ExtraBold",
  dmSansRegular: "DMSans_400Regular",
  dmSansMedium: "DMSans_500Medium",
  dmSansSemibold: "DMSans_600SemiBold",
} as const;

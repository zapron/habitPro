import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

type Props = {
  /** Matches the host card's own border radius so the highlight's corners line up. */
  radius: number;
};

/**
 * The static glass-sheen top highlight shared by every "card" surface in the
 * app — originated on the mission detail screen's Timer/StreakProgressCard
 * cards, since ported to the Home screen and (incrementally) the squad
 * screen. Absolutely positioned across just the top ~18px; never needs the
 * host to set `overflow: hidden` since it never extends past the card's own
 * bounds.
 *
 * A white-tinted sheen reads as glass catching light on a dark card, but on a
 * near-white light-mode surface it has no contrast to catch against — a
 * slate-tinted version was tried instead and just read as a flat gray smudge
 * across the top of a white card, which looked worse than nothing. Light mode
 * renders no highlight at all for now; dark mode is unchanged.
 *
 * The Minimalist theme pack never renders this at all, in either light or
 * dark — that pack is deliberately flat (border + flat fill only, no glass
 * or shadow anywhere), so this glassy dark-mode sheen would fight it.
 */
export function GlassTopHighlight({ radius }: Props) {
  const { isDark, themePack } = useTheme();
  if (!isDark || themePack === 'minimalist') return null;
  return (
    <LinearGradient
      pointerEvents="none"
      colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.highlight, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
    />
  );
}

const styles = StyleSheet.create({
  highlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 18,
  },
});

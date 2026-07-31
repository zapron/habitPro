import { memo, useId } from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect, G, ClipPath } from "react-native-svg";
import { Text } from "../AppText";
import { PETROL } from "./FuelPetrolGraphics";
import { withAlpha, darkTheme, lightTheme } from "../../styles/theme";

const MAX_MIN = 480;

type Props = {
  label: string;
  minutes: number;
  active: boolean;
  onPress: () => void;
  isDark: boolean;
};

/** Hour+ presets: compact side-view fuel tanks. Fill = duration / max. */
export const FuelTimePresetButton = memo(function FuelTimePresetButton({
  label,
  minutes,
  active,
  onPress,
  isDark,
}: Props) {
  const fillRatio = Math.min(1, Math.max(0.06, minutes / MAX_MIN));

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[
        styles.card,
        {
          borderColor: active ? PETROL.borderActive : isDark ? PETROL.borderIdle : "rgba(13, 148, 136, 0.32)",
          backgroundColor: active
            ? isDark
              ? "rgba(13, 148, 136, 0.22)"
              : "rgba(204, 251, 241, 0.55)"
            : isDark
              ? "rgba(15, 23, 42, 0.55)"
              : "rgba(255, 255, 255, 0.85)",
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label} fuel`}
    >
      <FuelTankFillGraphic fillRatio={fillRatio} active={active} isDark={isDark} />
      <Text
        style={[
          styles.caption,
          {
            color: active ? (isDark ? PETROL.textOnPetrol : "#0f766e") : isDark ? "rgba(226, 232, 240, 0.9)" : "#134e4a",
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
});

const FuelTankFillGraphic = memo(function FuelTankFillGraphic({
  fillRatio,
  active,
  isDark,
}: {
  fillRatio: number;
  active: boolean;
  isDark: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const gid = `ftg-${uid}`;
  const cid = `ftc-${uid}`;
  const innerX = 6;
  const innerY = 11;
  const innerW = 52;
  const innerH = 16;
  const liquidH = Math.max(2, innerH * fillRatio);
  const liquidY = innerY + innerH - liquidH;
  const stroke = active ? PETROL.bright : isDark ? "rgba(94, 234, 212, 0.45)" : "rgba(13, 148, 136, 0.55)";

  return (
    <Svg width={52} height={32} viewBox="0 0 64 40">
      <Defs>
        <LinearGradient id={gid} x1="0%" y1="100%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={PETROL.deep} />
          <Stop offset="0.45" stopColor={PETROL.mid} />
          <Stop offset="1" stopColor={PETROL.bright} />
        </LinearGradient>
        <ClipPath id={cid}>
          <Rect x={innerX} y={innerY} width={innerW} height={innerH} rx={3} />
        </ClipPath>
      </Defs>
      <Rect
        x="4"
        y="9"
        width="56"
        height="20"
        rx="4"
        fill={isDark ? withAlpha(darkTheme.colors.slate[900], 40) : withAlpha(lightTheme.colors.surfaceElevated, 90)}
        stroke={stroke}
        strokeWidth={active ? 1.4 : 1}
      />
      <G clipPath={`url(#${cid})`}>
        <Rect x={innerX} y={liquidY} width={innerW} height={liquidH + 0.5} fill={`url(#${gid})`} />
      </G>
      <Rect x="54" y="12" width="5" height="14" rx="1.5" fill={PETROL.deep} opacity={0.85} />
      <Rect x="5" y="12" width="5" height="14" rx="1.5" fill={PETROL.deep} opacity={0.75} />
      <Rect x="10" y="13" width="44" height="3" rx="1" fill={PETROL.mid} opacity={0.25} />
    </Svg>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 56,
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 2,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  caption: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2,
  },
});

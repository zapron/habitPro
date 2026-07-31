import { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, useWindowDimensions } from "react-native";
import type { AppTheme } from "../styles/theme";
import { withAlpha } from "../styles/theme";

type RowProps = {
  theme: AppTheme;
  isDark: boolean;
};

export function CommunityWinFeedSkeletonRow({ theme, isDark }: RowProps) {
  const { width } = useWindowDimensions();
  const pulse = useRef(new Animated.Value(0.32)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.28, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const bone = isDark ? withAlpha(theme.colors.sheen, 8) : withAlpha(theme.colors.sheen, 7);
  const boneBorder = theme.colors.border;

  return (
    <View
      style={[
        styles.tile,
        {
          width,
          backgroundColor: theme.colors.background,
          borderColor: boneBorder,
        },
      ]}
    >
      <Animated.View style={[styles.imgBlock, { backgroundColor: bone, opacity: pulse }]} />
      <View style={[styles.meta, { borderTopColor: boneBorder }]}>
        <View style={styles.row1}>
          <Animated.View style={[styles.pillSm, { backgroundColor: bone, opacity: pulse }]} />
          <Animated.View style={[styles.timeSk, { backgroundColor: bone, opacity: pulse }]} />
        </View>
        <View style={styles.row2}>
          <Animated.View style={[styles.titleSk, { backgroundColor: bone, opacity: pulse }]} />
          <Animated.View style={[styles.btnSk, { backgroundColor: bone, opacity: pulse }]} />
        </View>
        <Animated.View style={[styles.lineSk, { backgroundColor: bone, opacity: pulse }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  imgBlock: {
    width: "100%",
    aspectRatio: 1,
  },
  meta: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  pillSm: { width: 72, height: 16, borderRadius: 8 },
  timeSk: { width: 48, height: 12, borderRadius: 6 },
  row2: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  titleSk: { flex: 1, height: 18, borderRadius: 6, maxWidth: "70%" },
  btnSk: { width: 76, height: 22, borderRadius: 9999 },
  lineSk: { height: 12, borderRadius: 6, width: "55%" },
});

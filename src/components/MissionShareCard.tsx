import { forwardRef } from "react";
import { Image, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "./AppText";
import { useTheme } from "../context/ThemeContext";

const CARD_WIDTH = 320;
const CARD_HEIGHT = 400;

type Props = {
  title: string;
  /** Local file URI only — a remote URL may not be loaded yet at capture time. */
  localPhotoUri?: string | null;
  dateLabel: string;
};

/**
 * Fixed-size, always-visible view captured by react-native-view-shot — anything
 * conditionally rendered here risks capturing a blank frame, so keep this
 * dumb and synchronous (no async image loads from remote URLs).
 */
export const MissionShareCard = forwardRef<View, Props>(function MissionShareCard(
  { title, localPhotoUri, dateLabel },
  ref,
) {
  const { theme } = useTheme();

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <LinearGradient
        colors={[theme.colors.indigo[600], theme.colors.cyan[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>
        <View style={styles.brandRow}>
          <Image
            source={require("../../assets/habitpro-logo-transparent-v3.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.brandText}>HabitPro</Text>
        </View>

        {localPhotoUri ? (
          <Image source={{ uri: localPhotoUri }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.checkmark}>✓</Text>
          </View>
        )}

        <View style={styles.captionBlock}>
          <Text style={styles.tag}>MISSION COMPLETE</Text>
          <Text style={styles.title} numberOfLines={3}>
            {title}
          </Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 24,
    overflow: "hidden",
  },
  inner: {
    flex: 1,
    padding: 20,
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logo: {
    width: 26,
    height: 26,
  },
  brandText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -0.2,
  },
  photo: {
    width: "100%",
    height: 176,
    borderRadius: 16,
    marginTop: 14,
  },
  photoPlaceholder: {
    width: "100%",
    height: 176,
    borderRadius: 16,
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  checkmark: {
    fontSize: 56,
    fontWeight: "900",
    color: "#ffffff",
  },
  captionBlock: {
    marginTop: 14,
  },
  tag: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: "rgba(255,255,255,0.78)",
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#ffffff",
    lineHeight: 28,
  },
  date: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.78)",
  },
});

import { forwardRef } from "react";
import { Image, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "./AppText";

const CARD_WIDTH = 320;
const CARD_HEIGHT = 400;

/** Sampled directly from the real logo's own gradient (deep navy anchor) — the bottom
 * scrim over a photo, not an invented brand color. */
const SCRIM_NAVY = "2,2,63";

type Props = {
  title: string;
  /**
   * Local or remote — caller is responsible for prefetching a remote URL
   * (see `prefetchCoverUriIfRemote` in mini/[id].tsx) before showing this
   * card, since capture happens the instant it mounts.
   */
  photoUri?: string | null;
  dateLabel: string;
};

/**
 * Fixed-size, always-visible view captured by react-native-view-shot — anything
 * conditionally rendered here risks capturing a blank frame, so keep this
 * dumb and synchronous. Two real layouts, not one shared tree with color swaps:
 * a photo fills the whole card Instagram-story style with a bottom scrim (matches
 * "Option C" from the redesign artifact); no photo falls back to a plain
 * neutral-surface card matching the app's own Minimalist theme pack, not a gradient.
 */
export const MissionShareCard = forwardRef<View, Props>(function MissionShareCard(
  { title, photoUri, dateLabel },
  ref,
) {
  const hasPhoto = Boolean(photoUri);

  const footer = (
    <View style={[styles.footer, hasPhoto ? styles.footerOnPhoto : styles.footerPlain]}>
      <Image source={require("../../assets/qr-get-habitpro.png")} style={styles.qr} />
      <View>
        <Text style={[styles.footerLine1, hasPhoto ? styles.textOnPhoto : styles.textPlainPrimary]}>
          Get HabitPro
        </Text>
        <Text style={[styles.footerLine2, hasPhoto ? styles.textOnPhotoMuted : styles.textPlainMuted]}>
          habitpro-web.vercel.app
        </Text>
      </View>
    </View>
  );

  if (hasPhoto) {
    return (
      <View ref={ref} collapsable={false} style={styles.card}>
        <Image source={{ uri: photoUri! }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        <LinearGradient
          colors={[`rgba(${SCRIM_NAVY},0.05)`, `rgba(${SCRIM_NAVY},0.32)`, `rgba(${SCRIM_NAVY},0.95)`]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.inner}>
          <View style={styles.brandRow}>
            <Image
              source={require("../../assets/habitpro-logo-transparent-v3.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={[styles.brandText, styles.textOnPhoto]}>HabitPro</Text>
          </View>
          <View style={styles.bottomBlock}>
            <Text style={[styles.tag, styles.textOnPhotoMuted]}>MISSION COMPLETE</Text>
            <Text style={[styles.title, styles.textOnPhoto]} numberOfLines={3}>
              {title}
            </Text>
            <Text style={[styles.date, styles.textOnPhotoMuted]}>{dateLabel}</Text>
            {footer}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View ref={ref} collapsable={false} style={[styles.card, styles.cardPlain]}>
      <View style={styles.inner}>
        <View style={styles.brandRow}>
          <Image
            source={require("../../assets/habitpro-logo-transparent-v3.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={[styles.brandText, styles.textPlainPrimary]}>HabitPro</Text>
        </View>
        <View style={styles.rule} />
        <Text style={[styles.tag, styles.tagPlain]}>MISSION COMPLETE</Text>
        <Text style={[styles.title, styles.textPlainPrimary]} numberOfLines={3}>
          {title}
        </Text>
        <Text style={[styles.date, styles.textPlainMuted]}>{dateLabel}</Text>
        <View style={styles.plainFooterSpacer} />
        {footer}
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
  cardPlain: {
    backgroundColor: "#17161c",
    borderWidth: 1,
    borderColor: "#28262f",
  },
  inner: {
    flex: 1,
    padding: 20,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logo: {
    width: 24,
    height: 24,
  },
  brandText: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  rule: {
    height: 1,
    backgroundColor: "#28262f",
    marginVertical: 16,
  },
  bottomBlock: {
    marginTop: "auto",
  },
  plainFooterSpacer: {
    flex: 1,
  },
  tag: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  tagPlain: {
    color: "#8484e0",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 27,
  },
  date: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
  },
  footer: {
    marginTop: 16,
    paddingTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  footerOnPhoto: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.22)",
  },
  footerPlain: {
    borderTopWidth: 1,
    borderTopColor: "#28262f",
  },
  qr: {
    width: 34,
    height: 34,
    borderRadius: 5,
  },
  footerLine1: {
    fontSize: 11,
    fontWeight: "800",
  },
  footerLine2: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
  },
  textOnPhoto: {
    color: "#ffffff",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  textOnPhotoMuted: {
    color: "rgba(255,255,255,0.78)",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  textPlainPrimary: {
    color: "#f2f1f5",
  },
  textPlainMuted: {
    color: "#847f91",
  },
});

import { useRef, useState } from "react";
import { Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { X } from "lucide-react-native";
import { Text } from "./AppText";
import { Button } from "./Button";
import { MissionShareCard } from "./MissionShareCard";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";

type DayGridData = {
  totalDays: number;
  doneDays: boolean[];
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  photoUri?: string | null;
  tagLabel?: string;
  /** Habit shares only — see `MissionShareCard`'s own prop of the same name. */
  dayGrid?: DayGridData | null;
  /**
   * Overrides the default "today" label — used once a specific day/task photo is
   * either the default pick or a deliberate one, so the card never claims a
   * day/photo pairing that isn't real. Falls back to today's date when absent.
   */
  dateLabel?: string;
};

export function ShareWinModal({ visible, onClose, title, photoUri, tagLabel, dayGrid, dateLabel: dateLabelOverride }: Props) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const dateLabel =
    dateLabelOverride ??
    new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: "png", quality: 1 });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        showToast("Sharing isn't available on this device.", "error");
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your win" });
    } catch {
      showToast("Couldn't create the share image.", "error");
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: isDark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.3)" }]}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          <View style={styles.head}>
            <Text style={[styles.headTitle, { color: theme.colors.textPrimary }]}>Share your win</Text>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
              hitSlop={12}
            >
              <X size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.cardWrap}>
            <MissionShareCard
              ref={cardRef}
              title={title}
              photoUri={photoUri}
              dateLabel={dateLabel}
              tagLabel={tagLabel}
              dayGrid={dayGrid}
            />
          </View>

          <Button
            title={sharing ? "Preparing..." : "Share"}
            onPress={() => void handleShare()}
            disabled={sharing}
            style={{
              marginTop: 18,
              backgroundColor: theme.colors.green[600],
              borderColor: theme.colors.green[500],
            }}
          />
          <TouchableOpacity onPress={onClose} style={styles.notNow} disabled={sharing}>
            <Text style={[styles.notNowText, { color: theme.colors.textMuted }]}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardWrap: {
    alignItems: "center",
  },
  notNow: {
    alignItems: "center",
    paddingVertical: 14,
  },
  notNowText: {
    fontSize: 14,
    fontWeight: "700",
  },
});

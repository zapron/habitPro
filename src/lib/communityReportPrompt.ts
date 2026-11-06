import { showAppAlert } from "../context/AppDialogContext";
import { reportCommunityWin, type CommunityActionResult, type CommunityReportReason } from "./communityWinsApi";

const REPORT_REASONS: { reason: CommunityReportReason; label: string }[] = [
  { reason: "copyright", label: "Copyright — not theirs to share" },
  { reason: "inappropriate", label: "Inappropriate" },
  { reason: "harassment", label: "Harassment" },
  { reason: "spam", label: "Spam" },
  { reason: "other", label: "Something else" },
];

/** Asks why, then reports someone else's Community post. `onResult` runs once the server answers. */
export function promptReportCommunityWin(winId: string, onResult: (res: CommunityActionResult) => void) {
  showAppAlert("Report this post", "Why are you reporting it?", [
    ...REPORT_REASONS.map(({ reason, label }) => ({
      text: label,
      style: "neutral" as const,
      onPress: () => void reportCommunityWin(winId, reason).then(onResult),
    })),
    { text: "Cancel", style: "cancel" as const },
  ]);
}

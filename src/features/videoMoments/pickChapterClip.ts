import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { showAppAlert } from "../../context/AppDialogContext";
import { VIDEO_MOMENT_MAX_MS } from "./credit";

/** iOS needs a beat after an action sheet closes before it can present the picker. */
const IOS_PICKER_PRESENT_DELAY_MS = 360;

export type PickedChapterClip = { uri: string; durationMs: number; posterUri: string };

/**
 * Records or picks a clip of 5 seconds or less and grabs its first frame as a
 * local poster. Returns null when the person cancels; explains any other
 * problem itself (permission, too long, unreadable) and returns null.
 */
export async function pickChapterClip(source: "camera" | "library"): Promise<PickedChapterClip | null> {
  const perm =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    showAppAlert(
      source === "camera" ? "Camera permission needed" : "Photos permission needed",
      "Allow access from Settings to add your chapter.",
    );
    return null;
  }
  if (Platform.OS === "ios") {
    await new Promise((resolve) => setTimeout(resolve, IOS_PICKER_PRESENT_DELAY_MS));
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["videos"],
    allowsEditing: true,
    videoMaxDuration: VIDEO_MOMENT_MAX_MS / 1000,
    quality: 0.8,
  };
  const res =
    source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = !res.canceled ? res.assets[0] : undefined;
  if (!asset) return null;
  const durationMs = asset.duration ?? 0;
  if (durationMs > VIDEO_MOMENT_MAX_MS + 500) {
    showAppAlert("Keep it to 5 seconds", "A chapter is 5 seconds or less. Trim the clip and try again.");
    return null;
  }
  try {
    const thumb = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 0, quality: 0.7 });
    return { uri: asset.uri, durationMs: durationMs || VIDEO_MOMENT_MAX_MS, posterUri: thumb.uri };
  } catch {
    showAppAlert("Couldn't use that video", "Try recording a new one.");
    return null;
  }
}

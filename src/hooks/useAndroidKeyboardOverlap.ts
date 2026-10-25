import { RefObject, useEffect, useState } from "react";
import { Keyboard, Platform, View } from "react-native";

/**
 * Android only: how many px of `containerRef` the open keyboard covers (0 on iOS,
 * where KeyboardAvoidingView handles it).
 *
 * With edge-to-edge on, Android no longer resizes the window for the keyboard,
 * and Modals never did — so fields near the bottom (memory note, mission brief)
 * ended up hidden behind it. Measuring the container against the keyboard's top
 * edge self-corrects: on a device that *does* resize, the container already
 * ends above the keyboard and this returns 0, so nothing gets double-padded.
 */
export function useAndroidKeyboardOverlap(
  containerRef: RefObject<View | null>,
  enabled = true,
): number {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android" || !enabled) {
      setOverlap(0);
      return;
    }
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      const keyboardTop = e.endCoordinates.screenY;
      const node = containerRef.current;
      if (!node) {
        setOverlap(Math.round(e.endCoordinates.height));
        return;
      }
      node.measureInWindow((_x, y, _w, h) => {
        setOverlap(Math.max(0, Math.round(y + h - keyboardTop)));
      });
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setOverlap(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [containerRef, enabled]);

  return overlap;
}

export function storageThumbnailUri(
  uri: string,
  width: number,
  height: number,
  quality = 58,
  /** "contain" keeps the whole photo (no crop) inside width x height. */
  resize: "cover" | "contain" = "cover",
): string {
  try {
    const url = new URL(uri);
    const renderMarker = "/storage/v1/render/image/public/";
    if (!url.pathname.includes(renderMarker)) return uri;

    url.searchParams.set("width", String(Math.max(1, Math.round(width))));
    url.searchParams.set("height", String(Math.max(1, Math.round(height))));
    url.searchParams.set("resize", resize);
    url.searchParams.set("quality", String(quality));
    return url.toString();
  } catch {
    return uri;
  }
}

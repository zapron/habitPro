export function storageThumbnailUri(
  uri: string,
  width: number,
  height: number,
  quality = 58,
): string {
  try {
    const url = new URL(uri);
    const renderMarker = "/storage/v1/render/image/public/";
    if (!url.pathname.includes(renderMarker)) return uri;

    url.searchParams.set("width", String(Math.max(1, Math.round(width))));
    url.searchParams.set("height", String(Math.max(1, Math.round(height))));
    url.searchParams.set("resize", "cover");
    url.searchParams.set("quality", String(quality));
    return url.toString();
  } catch {
    return uri;
  }
}

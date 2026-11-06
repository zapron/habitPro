/**
 * Where a Chapter clip sits in a moment's slides.
 *
 * A normal mission's day has one photo slot, so its chapter simply replaces the
 * photo (the poster is the photo). A checklist day has a slide per task, so its
 * chapter is its own first slide, tagged with CHAPTER_SLIDE_ID in the post's
 * memory_gallery. The playable URL itself never comes from the gallery JSON: it
 * comes from the post's video_url (or the memory's videoUrl), which the server
 * only accepts for a claimed clip.
 */
export const CHAPTER_SLIDE_ID = "chapter";

export function chapterSlideLabel(chapter?: number | null): string {
  return chapter ? `Chapter ${chapter}` : "Chapter";
}

/**
 * Puts `videoUrl` on the slide that shows its poster: the single slide of a
 * one-photo moment, or the slide tagged CHAPTER_SLIDE_ID in a catalog.
 */
export function attachChapterVideo<T extends object>(
  slides: T[],
  videoUrl: string | null | undefined,
  isChapterSlide: (slide: T) => boolean,
): (T & { videoUrl?: string | null })[] {
  if (!videoUrl || slides.length === 0) return slides;
  if (slides.length === 1) return [{ ...slides[0], videoUrl }];
  return slides.map((slide) => (isChapterSlide(slide) ? { ...slide, videoUrl } : slide));
}

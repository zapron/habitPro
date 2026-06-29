export type JourneyMiniGridLayout = {
  columnCount: number;
  gap: number;
  tileWidth: number;
};

type JourneyMiniGridOptions = {
  gap?: number;
  minTileWidth?: number;
  maxColumns?: number;
};

export function getJourneyMiniGridLayout(
  availableWidth: number,
  options: JourneyMiniGridOptions = {},
): JourneyMiniGridLayout {
  const gap = options.gap ?? 10;
  const minTileWidth = options.minTileWidth ?? 150;
  const maxColumns = options.maxColumns ?? 5;
  const width = Math.max(0, Math.floor(availableWidth));
  const rawColumns = Math.floor((width + gap) / (minTileWidth + gap));
  const columnCount = Math.max(2, Math.min(maxColumns, rawColumns || 2));
  const tileWidth = Math.floor((width - gap * (columnCount - 1)) / columnCount);

  return {
    columnCount,
    gap,
    tileWidth: Math.max(0, tileWidth),
  };
}

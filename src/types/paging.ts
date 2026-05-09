export type PageRequest = {
  offset: number;
  limit: number;
};

export type PageResult<T> = {
  items: T[];
  hasMore: boolean;
  nextOffset: number | null;
};


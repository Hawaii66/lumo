export type PageRange = {
  start: number;
  end: number;
};

/** Expand 1-based inclusive ranges into sorted unique page numbers. */
export function expandPageRanges(ranges: Array<PageRange>): Array<number> {
  const pages = new Set<number>();
  for (const range of ranges) {
    for (let page = range.start; page <= range.end; page += 1) {
      pages.add(page);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

/** Merged PDF page order: ranges applied sequentially (same as client merge). */
export function mergedPageToOriginal(
  ranges: Array<PageRange>,
): Array<number> {
  const pages: Array<number> = [];
  for (const range of ranges) {
    for (let page = range.start; page <= range.end; page += 1) {
      pages.push(page);
    }
  }
  return pages;
}

export function subtractPages(
  requested: Array<number>,
  completed: ReadonlySet<number>,
): Array<number> {
  return requested.filter((page) => !completed.has(page));
}

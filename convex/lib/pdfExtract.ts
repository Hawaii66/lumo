export const MAX_EXTRACT_RANGES = 50;

export type PageRange = {
  start: number;
  end: number;
};

/** Ordered ranges as `"1-3,10-12"` (order-sensitive). */
export function pageRangesKey(ranges: PageRange[]): string {
  return ranges.map((r) => `${r.start}-${r.end}`).join(",");
}

/** `sourceHash|1-3,10-12` */
export function inputKeyFromExtract(
  sourceHash: string,
  ranges: PageRange[],
): string {
  return `${sourceHash}|${pageRangesKey(ranges)}`;
}

/**
 * Reject empty, inverted, or overlapping inclusive ranges.
 * Overlap: sort by start, require prev.end < next.start (adjacent is OK).
 */
export function assertValidPageRanges(ranges: PageRange[]): void {
  if (ranges.length === 0) {
    throw new Error("Välj minst ett sidintervall");
  }
  if (ranges.length > MAX_EXTRACT_RANGES) {
    throw new Error(`Högst ${MAX_EXTRACT_RANGES} sidintervall tillåtna`);
  }

  for (const range of ranges) {
    if (
      !Number.isInteger(range.start) ||
      !Number.isInteger(range.end) ||
      range.start < 1 ||
      range.end < 1
    ) {
      throw new Error("Sidnummer måste vara positiva heltal");
    }
    if (range.start > range.end) {
      throw new Error(
        `Ogiltigt intervall ${range.start}–${range.end}: start måste vara ≤ slut`,
      );
    }
  }

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const next = sorted[i]!;
    if (prev.end >= next.start) {
      throw new Error(
        `Sidintervallen ${prev.start}–${prev.end} och ${next.start}–${next.end} överlappar`,
      );
    }
  }
}

/** Human-readable “s. 1–3, 10–12”. */
export function formatPageRanges(ranges: PageRange[]): string {
  return ranges.map((r) => `${r.start}–${r.end}`).join(", ");
}

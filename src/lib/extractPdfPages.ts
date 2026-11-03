import { PDFDocument } from "pdf-lib"
import {
  assertValidPageRanges,
  type PageRange,
} from "../../convex/lib/pdfExtract"

export type { PageRange }

export async function getPdfPageCount(bytes: ArrayBuffer): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return doc.getPageCount()
}

/**
 * Validate ranges against a known page count (1-indexed inclusive).
 * Also checks non-overlap via assertValidPageRanges.
 */
export function validatePageRangesAgainstCount(
  ranges: PageRange[],
  pageCount: number,
): void {
  assertValidPageRanges(ranges)
  if (pageCount < 1) {
    throw new Error("PDF:en har inga sidor")
  }
  for (const range of ranges) {
    if (range.end > pageCount) {
      throw new Error(
        `Sidan ${range.end} finns inte (PDF:en har ${pageCount} sidor)`,
      )
    }
  }
}

/**
 * Build a new PDF containing only the given 1-indexed inclusive page ranges,
 * copied in the order the ranges are listed.
 */
export async function extractPdfPages(
  bytes: ArrayBuffer,
  ranges: PageRange[],
): Promise<Uint8Array> {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const pageCount = source.getPageCount()
  validatePageRangesAgainstCount(ranges, pageCount)

  const extracted = await PDFDocument.create()
  for (const range of ranges) {
    // pdf-lib uses 0-based indices
    const indices: number[] = []
    for (let page = range.start; page <= range.end; page++) {
      indices.push(page - 1)
    }
    const pages = await extracted.copyPages(source, indices)
    for (const page of pages) {
      extracted.addPage(page)
    }
  }

  return await extracted.save()
}

/** Total page count selected by the ranges (assumes already validated). */
export function countPagesInRanges(ranges: PageRange[]): number {
  return ranges.reduce((sum, r) => sum + (r.end - r.start + 1), 0)
}

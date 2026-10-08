import { PDFDocument } from "pdf-lib"

export type PageRange = {
  start: number
  end: number
}

export async function getPdfPageCount(sourceBytes: ArrayBuffer): Promise<number> {
  const src = await PDFDocument.load(sourceBytes, { ignoreEncryption: true })
  return src.getPageCount()
}

/**
 * Merge 1-based inclusive page ranges into a new PDF (bytes).
 * Ranges are applied in order; duplicates are kept if listed twice.
 */
export async function mergePdfPageRanges(
  sourceBytes: ArrayBuffer,
  ranges: Array<PageRange>,
): Promise<Uint8Array> {
  if (ranges.length === 0) {
    throw new Error("Välj minst ett sidintervall")
  }

  const src = await PDFDocument.load(sourceBytes, { ignoreEncryption: true })
  const pageCount = src.getPageCount()
  const indices: Array<number> = []

  for (const range of ranges) {
    if (
      !Number.isInteger(range.start) ||
      !Number.isInteger(range.end) ||
      range.start < 1 ||
      range.end < range.start ||
      range.end > pageCount
    ) {
      throw new Error(
        `Ogiltigt intervall ${range.start}–${range.end} (PDF har ${pageCount} sidor)`,
      )
    }
    for (let page = range.start; page <= range.end; page += 1) {
      indices.push(page - 1)
    }
  }

  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, indices)
  for (const page of pages) {
    out.addPage(page)
  }
  return out.save()
}

import { PDFDocument } from "pdf-lib"

/**
 * Concatenate PDF byte arrays in order into one PDF.
 * Does not insert pages or rewrite document structure beyond pdf-lib defaults.
 */
export async function mergePdfBlobs(
  blobs: ArrayBuffer[],
): Promise<Uint8Array> {
  if (blobs.length < 2) {
    throw new Error("Minst två PDF:er krävs för sammanslagning")
  }

  const merged = await PDFDocument.create()

  for (const blob of blobs) {
    const source = await PDFDocument.load(blob, {
      ignoreEncryption: true,
    })
    const pages = await merged.copyPages(source, source.getPageIndices())
    for (const page of pages) {
      merged.addPage(page)
    }
  }

  return await merged.save()
}

import { strToU8, zipSync } from "fflate"

/** Build a zip with `<name>/{middle,format,expected}.json` for repo extract. */
export function buildSplitFixtureZip(args: {
  suggestedName: string
  middle: unknown
  format: unknown
  expected: unknown
}): Uint8Array {
  const dir = args.suggestedName
  const encode = (value: unknown) =>
    strToU8(`${JSON.stringify(value, null, 2)}\n`)

  return zipSync({
    [`${dir}/middle.json`]: encode(args.middle),
    [`${dir}/format.json`]: encode(args.format),
    [`${dir}/expected.json`]: encode(args.expected),
  })
}

export function downloadSplitFixtureZip(
  suggestedName: string,
  zipBytes: Uint8Array,
): void {
  const copy = new Uint8Array(zipBytes.byteLength)
  copy.set(zipBytes)
  const blob = new Blob([copy], { type: "application/zip" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${suggestedName}.zip`
  anchor.click()
  URL.revokeObjectURL(url)
}

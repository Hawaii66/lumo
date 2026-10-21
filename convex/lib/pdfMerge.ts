export const MIN_MERGE_INPUTS = 2;
export const MAX_MERGE_INPUTS = 20;

/** Ordered SHA-256 hashes joined by "|". */
export function inputKeyFromHashes(hashes: string[]): string {
  return hashes.join("|");
}

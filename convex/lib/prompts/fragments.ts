/** Join non-empty prompt sections with blank lines. */
export function sections(
  ...blocks: Array<string | false | undefined | null>
): string {
  return blocks
    .filter((b): b is string => typeof b === "string" && b.length > 0)
    .join("\n\n");
}

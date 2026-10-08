import { ComputeEngine } from "@cortex-js/compute-engine"

const ce = new ComputeEngine()

/** Compare two LaTeX expressions for mathematical equality. */
export function latexEquals(a: string, b: string): boolean {
  const left = a.trim()
  const right = b.trim()
  if (!left || !right) return false
  if (left === right) return true

  try {
    const exprA = ce.parse(left)
    const exprB = ce.parse(right)
    if (!exprA.isValid || !exprB.isValid) return false

    const equal = exprA.simplify().isEqual(exprB.simplify())
    if (equal === true) return true
    if (equal === false) return false

    // Fallback when isEqual is inconclusive (undefined).
    return (
      JSON.stringify(exprA.simplify().canonical.json) ===
      JSON.stringify(exprB.simplify().canonical.json)
    )
  } catch {
    return false
  }
}

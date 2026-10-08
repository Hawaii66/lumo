import {
  ComputeEngine,
  evaluate,
  expand,
  N,
  simplify,
} from "@cortex-js/compute-engine"

export type ComputeResult = {
  latex: string
  json: unknown
  text: string
  /** Human-readable Compute Engine error, if the result is invalid. */
  error?: string
}

export type ComputeDemoResults = {
  simplify: ComputeResult | null
  evaluate: ComputeResult | null
  numeric: ComputeResult | null
  expand: ComputeResult | null
  error: string | null
}

type BoxedExpr = {
  latex?: string
  json?: unknown
  operator?: string
  shape?: unknown
  valueOf?: () => unknown
}

const displayEngine = new ComputeEngine()

const ERROR_MESSAGES: Record<string, string> = {
  "expected-square-matrix":
    "Invers kräver en kvadratisk matris (n×n). En 3×2-matris har ingen invers.",
  "division-by-zero": "Division med noll.",
  "expected-number": "Förväntade ett tal.",
}

function stripQuotes(value: unknown): string {
  return String(value ?? "").replace(/^'+|'+$/g, "")
}

function containsError(json: unknown): boolean {
  if (Array.isArray(json)) {
    if (json[0] === "Error") return true
    return json.some(containsError)
  }
  if (json && typeof json === "object") {
    return Object.values(json).some(containsError)
  }
  return false
}

function collectErrorCodes(json: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(json)) {
    if (json[0] === "Error") {
      out.add(stripQuotes(json[1]))
      return out
    }
    for (const item of json) collectErrorCodes(item, out)
  } else if (json && typeof json === "object") {
    for (const value of Object.values(json)) collectErrorCodes(value, out)
  }
  return out
}

function formatErrorMessage(json: unknown): string {
  const codes = [...collectErrorCodes(json)]
  if (codes.length === 0) return "Beräkningen misslyckades."
  return codes.map((code) => ERROR_MESSAGES[code] ?? code).join(" · ")
}

/** True when MathJSON is a rectangular list-of-lists (a matrix). */
function isMatrixLikeJson(json: unknown): boolean {
  if (!Array.isArray(json) || json[0] !== "List" || json.length < 2) {
    return false
  }

  const rows = json.slice(1)
  const first = rows[0]
  if (!Array.isArray(first) || first[0] !== "List" || first.length < 2) {
    return false
  }

  const colCount = first.length - 1
  return rows.every(
    (row) =>
      Array.isArray(row) &&
      row[0] === "List" &&
      row.length - 1 === colCount &&
      !containsError(row),
  )
}

/**
 * Compute Engine often evaluates matrix ops to nested lists.
 * Re-box those as Matrix so MathLive renders `\begin{pmatrix}...`.
 * Skip wrapping when the result contains errors (e.g. inverse of non-square).
 */
function formatLatex(expr: BoxedExpr): string {
  const json = expr.json
  if (containsError(json)) {
    // Avoid a pmatrix full of \error{...} cells — keep it symbolic instead.
    return expr.latex && !expr.latex.includes("\\error")
      ? expr.latex
      : String(expr.latex ?? "")
  }

  const alreadyMatrix = expr.operator === "Matrix"
  const looksLikeMatrix =
    !alreadyMatrix &&
    (isMatrixLikeJson(json) ||
      (Array.isArray(expr.shape) &&
        expr.shape.length === 2 &&
        expr.operator === "List" &&
        isMatrixLikeJson(json)))

  if (looksLikeMatrix && json != null) {
    try {
      return displayEngine.box(["Matrix", json as never]).latex
    } catch {
      // Fall through to the engine's default serialization.
    }
  }

  return expr.latex ?? String(json ?? "")
}

function toResult(value: unknown): ComputeResult | null {
  if (value == null) return null

  if (typeof value === "string" || typeof value === "number") {
    return {
      latex: String(value),
      json: value,
      text: String(value),
    }
  }

  if (typeof value === "object") {
    const expr = value as BoxedExpr
    const json = expr.json ?? value
    const text =
      typeof expr.valueOf === "function"
        ? String(expr.valueOf())
        : String(expr.latex ?? json ?? "")

    const hasError = containsError(json)
    return {
      latex: hasError ? "" : formatLatex(expr),
      json,
      text,
      error: hasError ? formatErrorMessage(json) : undefined,
    }
  }

  return {
    latex: String(value),
    json: value,
    text: String(value),
  }
}

function runSafe(
  label: string,
  fn: () => unknown,
): { result: ComputeResult | null; error: string | null } {
  try {
    return { result: toResult(fn()), error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { result: null, error: `${label}: ${message}` }
  }
}

/** Shared engine used when assigning symbol values (e.g. x = 3). */
export function createComputeEngine() {
  return new ComputeEngine()
}

export function runComputeDemo(
  latex: string,
  options?: { x?: number | null },
): ComputeDemoResults {
  const input = latex.trim()
  if (!input) {
    return {
      simplify: null,
      evaluate: null,
      numeric: null,
      expand: null,
      error: null,
    }
  }

  const errors: string[] = []

  if (options?.x != null && Number.isFinite(options.x)) {
    const ce = createComputeEngine()
    ce.assign("x", options.x)
    const expr = ce.parse(input)

    const simplifyRun = runSafe("simplify", () => expr.simplify())
    const evaluateRun = runSafe("evaluate", () => expr.evaluate())
    const numericRun = runSafe("N", () => expr.N())
    const expandRun = runSafe("expand", () => expand(input))

    for (const run of [simplifyRun, evaluateRun, numericRun, expandRun]) {
      if (run.error) errors.push(run.error)
    }

    return {
      simplify: simplifyRun.result,
      evaluate: evaluateRun.result,
      numeric: numericRun.result,
      expand: expandRun.result,
      error: errors.length > 0 ? errors.join(" · ") : null,
    }
  }

  const simplifyRun = runSafe("simplify", () => simplify(input))
  const evaluateRun = runSafe("evaluate", () => evaluate(input))
  const numericRun = runSafe("N", () => N(input))
  const expandRun = runSafe("expand", () => expand(input))

  for (const run of [simplifyRun, evaluateRun, numericRun, expandRun]) {
    if (run.error) errors.push(run.error)
  }

  return {
    simplify: simplifyRun.result,
    evaluate: evaluateRun.result,
    numeric: numericRun.result,
    expand: expandRun.result,
    error: errors.length > 0 ? errors.join(" · ") : null,
  }
}

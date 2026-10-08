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
}

export type ComputeDemoResults = {
  simplify: ComputeResult | null
  evaluate: ComputeResult | null
  numeric: ComputeResult | null
  expand: ComputeResult | null
  error: string | null
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
    const expr = value as {
      latex?: string
      json?: unknown
      valueOf?: () => unknown
    }
    const text =
      typeof expr.valueOf === "function"
        ? String(expr.valueOf())
        : String(expr.latex ?? expr.json ?? "")

    return {
      latex: expr.latex ?? text,
      json: expr.json ?? value,
      text,
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

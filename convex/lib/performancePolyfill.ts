/**
 * Convex V8 may lack `performance` that @opentelemetry/core expects.
 * Import this module before any OTEL import.
 */
if (typeof performance === "undefined") {
  class MockPerformance {
    timeOrigin = Date.now();
    now() {
      return Date.now() - this.timeOrigin;
    }
  }
  globalThis.performance = new MockPerformance() as unknown as Performance;
}

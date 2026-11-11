import "./performancePolyfill";

import { trace } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { PostHogSpanProcessor } from "@posthog/ai/otel";

const projectToken = process.env.POSTHOG_PROJECT_TOKEN ?? "";
const host = process.env.POSTHOG_HOST;

const processor = new PostHogSpanProcessor({
  projectToken,
  ...(host !== undefined && host.length > 0 ? { host } : {}),
});

const provider = new BasicTracerProvider({
  resource: resourceFromAttributes({
    "service.name": "lumo-convex",
  }),
  spanProcessors: [processor],
});

trace.setGlobalTracerProvider(provider);

/** Flush queued AI spans before a Convex action returns. */
export async function forceFlushPosthogTraces(): Promise<void> {
  await processor.forceFlush();
}

export function aiTelemetry(args: {
  functionId: string;
  distinctId: string;
  sessionId?: string;
}) {
  return {
    isEnabled: true as const,
    functionId: args.functionId,
    metadata: {
      posthog_distinct_id: args.distinctId,
      ...(args.sessionId !== undefined
        ? { $ai_session_id: args.sessionId }
        : {}),
    },
  };
}

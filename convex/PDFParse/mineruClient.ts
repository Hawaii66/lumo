import {
  extractMiddleJson,
  parseMineruCompletedResponse,
  parseMineruJobStatus,
  type MiddleJson,
  type MineruJobStatus,
} from "./mineruSchema";

const MINERU_PARSE_URL =
  "https://mineru-production-9651.up.railway.app/v1/file_parse?tier=basic&ocr_mode=auto&response_format=json&output_formats=middle_json";

const MINERU_BASE_URL = "https://mineru-production-9651.up.railway.app";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 80;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveMinerUUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  if (pathOrUrl.startsWith("/")) {
    return `${MINERU_BASE_URL}${pathOrUrl}`;
  }
  return `${MINERU_BASE_URL}/${pathOrUrl}`;
}

async function waitForMinerUResult(initial: unknown): Promise<unknown> {
  let current: MineruJobStatus = parseMineruJobStatus(initial);
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const status = current.status;
    if (status === "completed") {
      return current;
    }
    if (status === "failed" || status === "cancelled" || status === "error") {
      throw new Error(`MinerU-jobb misslyckades: ${JSON.stringify(status)}`);
    }

    const statusUrl = current.status_url ?? current.result_url ?? null;

    if (statusUrl === null) {
      if (Array.isArray(current.files) && current.files.length > 0) {
        return current;
      }
      throw new Error("MinerU-svar saknar status_url och completed status");
    }

    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(resolveMinerUUrl(statusUrl));
    if (!res.ok) {
      throw new Error(
        `MinerU status-poll misslyckades: ${res.status} ${await res.text()}`,
      );
    }
    current = parseMineruJobStatus(await res.json());
  }
  throw new Error("MinerU-jobb timeout");
}

/**
 * Upload a PDF blob to MinerU, wait for completion, and return validated middle_json.
 */
export async function fetchMineruMiddleJson(
  pdf: Blob,
  filename = "document.pdf",
): Promise<MiddleJson> {
  const form = new FormData();
  form.append("files", pdf, filename);

  const parseResponse = await fetch(MINERU_PARSE_URL, {
    method: "POST",
    body: form,
  });

  if (!parseResponse.ok) {
    throw new Error(
      `MinerU file_parse misslyckades: ${parseResponse.status} ${await parseResponse.text()}`,
    );
  }

  const completed = await waitForMinerUResult(await parseResponse.json());
  return extractMiddleJson(parseMineruCompletedResponse(completed));
}

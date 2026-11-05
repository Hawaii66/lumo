import { unzipSync } from "fflate";
import {
  middleJsonSchema,
  parseMineruCreateTaskResponse,
  parseMineruTaskDetail,
  type MiddleJson,
  type MineruTaskDetail,
} from "./mineruSchema";

const MINERU_BASE_URL = "https://mineru-production-9651.up.railway.app";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 80;

const MIDDLE_JSON_ENTRY = "middle_json.json";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Prefer HTTPS for same-host MinerU links (API sometimes returns http://). */
function resolveMinerUUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    try {
      const url = new URL(pathOrUrl);
      const base = new URL(MINERU_BASE_URL);
      if (url.hostname === base.hostname) {
        url.protocol = base.protocol;
        return url.toString();
      }
    } catch {
      // Fall through and return as-is.
    }
    return pathOrUrl;
  }
  if (pathOrUrl.startsWith("/")) {
    return `${MINERU_BASE_URL}${pathOrUrl}`;
  }
  return `${MINERU_BASE_URL}/${pathOrUrl}`;
}

/** Extract one named entry from a MinerU result ZIP. */
function readZipEntry(zipBytes: ArrayBuffer, entryName: string): Uint8Array {
  const files = unzipSync(new Uint8Array(zipBytes));
  const exact = files[entryName];
  if (exact !== undefined) {
    return exact;
  }
  const nested = Object.entries(files).find(
    ([name]) => name === entryName || name.endsWith(`/${entryName}`),
  );
  if (nested !== undefined) {
    return nested[1];
  }
  throw new Error(`MinerU-ZIP saknar ${entryName}`);
}

async function createTask(
  fileName: string,
  byteLength: number,
): Promise<{ taskId: string; uploadUrl: string; uploadHeaders: Record<string, string> }> {
  const res = await fetch(`${MINERU_BASE_URL}/v1/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tier: "basic",
      ocr_mode: "auto",
      output_formats: ["default"],
      files: [{ file_name: fileName, bytes: byteLength }],
    }),
  });

  if (!res.ok) {
    throw new Error(
      `MinerU create task misslyckades: ${res.status} ${await res.text()}`,
    );
  }

  const created = parseMineruCreateTaskResponse(await res.json());
  const file = created.files[0]!;
  if (file.upload === null || file.upload === undefined) {
    throw new Error("MinerU create task saknar upload-länk");
  }

  return {
    taskId: created.task_id,
    uploadUrl: resolveMinerUUrl(file.upload.url),
    uploadHeaders: file.upload.headers,
  };
}

async function uploadFile(
  uploadUrl: string,
  headers: Record<string, string>,
  pdf: Blob,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers,
    body: pdf,
  });
  if (!res.ok) {
    throw new Error(
      `MinerU upload misslyckades: ${res.status} ${await res.text()}`,
    );
  }
}

async function pollTask(taskId: string): Promise<MineruTaskDetail> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(
      `${MINERU_BASE_URL}/v1/tasks/${encodeURIComponent(taskId)}`,
    );
    if (!res.ok) {
      throw new Error(
        `MinerU status-poll misslyckades: ${res.status} ${await res.text()}`,
      );
    }

    const detail = parseMineruTaskDetail(await res.json());
    const status = detail.status;

    if (status === "completed") {
      return detail;
    }
    if (
      status === "failed" ||
      status === "canceled" ||
      status === "partial"
    ) {
      throw new Error(`MinerU-jobb misslyckades: ${JSON.stringify(detail)}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("MinerU-jobb timeout");
}

async function downloadMiddleJson(resultUrl: string): Promise<MiddleJson> {
  const res = await fetch(resolveMinerUUrl(resultUrl));
  if (!res.ok) {
    throw new Error(
      `MinerU result-download misslyckades: ${res.status} ${await res.text()}`,
    );
  }

  const entry = readZipEntry(await res.arrayBuffer(), MIDDLE_JSON_ENTRY);
  const parsed = middleJsonSchema.safeParse(
    JSON.parse(new TextDecoder().decode(entry)),
  );
  if (!parsed.success) {
    throw new Error(
      `Ogiltig MinerU middle_json: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

/**
 * Upload a PDF to MinerU Tasks API (4.1+), wait for completion, and return
 * validated middle_json from the default result ZIP.
 */
export async function fetchMineruMiddleJson(
  pdf: Blob,
  filename = "document.pdf",
): Promise<MiddleJson> {
  const { taskId, uploadUrl, uploadHeaders } = await createTask(
    filename,
    pdf.size,
  );
  await uploadFile(uploadUrl, uploadHeaders, pdf);
  const detail = await pollTask(taskId);

  const file = detail.files[0];
  if (file === undefined || file.status !== "completed" || !file.result_url) {
    throw new Error(
      `MinerU completed utan result_url: ${JSON.stringify(detail.files)}`,
    );
  }
  if (file.error !== null && file.error !== undefined) {
    throw new Error(`MinerU-filfel: ${JSON.stringify(file.error)}`);
  }

  return await downloadMiddleJson(file.result_url);
}

import { unzipSync } from "fflate";
import {
  middleJsonSchema,
  parseMineruCreateTaskResponse,
  parseMineruTaskDetail,
  type MiddleJson,
  type MineruTaskDetail,
} from "./mineruSchema";

const MINERU_BASE_URL = "https://mineru-production-9651.up.railway.app";

/** How often a scheduled poll re-checks MinerU status. */
export const MINERU_POLL_INTERVAL_MS = 15_000;
/** Max wall time from task attach until we fail waiters. */
export const MINERU_DEADLINE_MS = 30 * 60 * 1000;
/**
 * Steal an in-flight claim that never got a taskId (crashed before upload).
 * Once a taskId exists, deadlineAt is the authority.
 */
export const MINERU_CLAIM_STALE_MS = 5 * 60 * 1000;

const MIDDLE_JSON_ENTRY = "middle_json.json";

const IMAGE_EXT_RE = /\.(?:jpe?g|png|gif|webp|bmp)$/i;

export type MineruZipResult = {
  middleJson: MiddleJson;
  /** Relative paths as referenced in middle_json (`images/…`) → bytes. */
  images: Map<string, Uint8Array>;
};

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

/** Normalize ZIP / middle_json image paths to `images/…` without a leading slash. */
export function normalizeMineruImagePath(path: string): string {
  const cleaned = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const idx = cleaned.indexOf("images/");
  if (idx >= 0) {
    return cleaned.slice(idx);
  }
  return cleaned.startsWith("images/") ? cleaned : `images/${cleaned}`;
}

function mimeFromImagePath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
}

export function blobFromMineruImage(
  path: string,
  bytes: Uint8Array,
): Blob {
  // Copy into a plain ArrayBuffer — Blob rejects SharedArrayBuffer views.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: mimeFromImagePath(path) });
}

/** Unpack middle_json + image files from a MinerU result ZIP. */
export function parseMineruZip(zipBytes: ArrayBuffer): MineruZipResult {
  const files = unzipSync(new Uint8Array(zipBytes));

  let middleEntry: Uint8Array | undefined;
  const images = new Map<string, Uint8Array>();

  for (const [name, data] of Object.entries(files)) {
    const normalized = name.replace(/\\/g, "/");
    if (
      normalized === MIDDLE_JSON_ENTRY ||
      normalized.endsWith(`/${MIDDLE_JSON_ENTRY}`)
    ) {
      middleEntry = data;
      continue;
    }

    const imagesIdx = normalized.indexOf("images/");
    if (imagesIdx < 0) {
      continue;
    }
    const path = normalized.slice(imagesIdx);
    if (path.endsWith("/") || !IMAGE_EXT_RE.test(path)) {
      continue;
    }
    images.set(normalizeMineruImagePath(path), data);
  }

  if (middleEntry === undefined) {
    throw new Error(`MinerU-ZIP saknar ${MIDDLE_JSON_ENTRY}`);
  }

  const parsed = middleJsonSchema.safeParse(
    JSON.parse(new TextDecoder().decode(middleEntry)),
  );
  if (!parsed.success) {
    throw new Error(
      `Ogiltig MinerU middle_json: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
  }

  return { middleJson: parsed.data, images };
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

/** Create a MinerU task and upload the PDF. Does not wait for completion. */
export async function startMineruTask(
  pdf: Blob,
  filename = "document.pdf",
): Promise<string> {
  const { taskId, uploadUrl, uploadHeaders } = await createTask(
    filename,
    pdf.size,
  );
  await uploadFile(uploadUrl, uploadHeaders, pdf);
  return taskId;
}

/** Fetch current MinerU task status. */
export async function fetchMineruTaskDetail(
  taskId: string,
): Promise<MineruTaskDetail> {
  const res = await fetch(
    `${MINERU_BASE_URL}/v1/tasks/${encodeURIComponent(taskId)}`,
  );
  if (!res.ok) {
    throw new Error(
      `MinerU status-poll misslyckades: ${res.status} ${await res.text()}`,
    );
  }
  return parseMineruTaskDetail(await res.json());
}

/** Download and unpack the result ZIP for a completed MinerU task. */
export async function downloadMineruZipFromDetail(
  detail: MineruTaskDetail,
): Promise<MineruZipResult> {
  const file = detail.files[0];
  if (file === undefined || file.status !== "completed" || !file.result_url) {
    throw new Error(
      `MinerU completed utan result_url: ${JSON.stringify(detail.files)}`,
    );
  }
  if (file.error !== null && file.error !== undefined) {
    throw new Error(`MinerU-filfel: ${JSON.stringify(file.error)}`);
  }

  const res = await fetch(resolveMinerUUrl(file.result_url));
  if (!res.ok) {
    throw new Error(
      `MinerU result-download misslyckades: ${res.status} ${await res.text()}`,
    );
  }
  return parseMineruZip(await res.arrayBuffer());
}

/**
 * Download the raw result ZIP bytes for a completed task (for Convex storage).
 */
export async function downloadMineruZipBytes(
  detail: MineruTaskDetail,
): Promise<ArrayBuffer> {
  const file = detail.files[0];
  if (file === undefined || file.status !== "completed" || !file.result_url) {
    throw new Error(
      `MinerU completed utan result_url: ${JSON.stringify(detail.files)}`,
    );
  }
  if (file.error !== null && file.error !== undefined) {
    throw new Error(`MinerU-filfel: ${JSON.stringify(file.error)}`);
  }

  const res = await fetch(resolveMinerUUrl(file.result_url));
  if (!res.ok) {
    throw new Error(
      `MinerU result-download misslyckades: ${res.status} ${await res.text()}`,
    );
  }
  return await res.arrayBuffer();
}

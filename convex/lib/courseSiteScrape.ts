import {
  canonicalizeMaiUrl,
  isPdfUrl,
  isUnderCoursePrefix,
  MAI_COURSE_HOST,
  type MaiCourseRoot,
} from "./maiCourseUrl";

const USER_AGENT =
  "Mozilla/5.0 (compatible; LumoCourseImport/1.0; +https://lumo.app)";
const FETCH_TIMEOUT_MS = 30_000;
const SKIP_PAGE_EXT = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".css",
  ".js",
  ".zip",
  ".ico",
  ".webp",
];

const HREF_RE = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

export type FetchedResource = {
  finalUrl: string;
  contentType: string;
  body: Uint8Array;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a URL that must stay on courses.mai.liu.se under the course prefix.
 * Follows redirects manually and rejects off-host / off-prefix targets.
 */
export async function fetchCourseResource(
  url: string,
  coursePrefix: string,
  maxRedirects = 5,
): Promise<FetchedResource> {
  let current = canonicalizeMaiUrl(url);
  if (!isUnderCoursePrefix(current, coursePrefix)) {
    throw new Error("URL utanför kursens sidor");
  }

  for (let i = 0; i <= maxRedirects; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "*/*",
        },
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Timeout vid hämtning");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get("Location")
    ) {
      const location = response.headers.get("Location")!;
      const next = canonicalizeMaiUrl(new URL(location, current).toString());
      if (!isUnderCoursePrefix(next, coursePrefix)) {
        throw new Error("Omdirigering utanför kursens sidor");
      }
      current = next;
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const finalUrl = canonicalizeMaiUrl(response.url || current);
    if (!isUnderCoursePrefix(finalUrl, coursePrefix)) {
      throw new Error("Svar från ogiltig värd");
    }

    const contentType = response.headers.get("Content-Type") ?? "";
    const buffer = new Uint8Array(await response.arrayBuffer());
    return { finalUrl, contentType, body: buffer };
  }

  throw new Error("För många omdirigeringar");
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  HREF_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HREF_RE.exec(html)) !== null) {
    const href = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) {
      continue;
    }
    let abs: string;
    try {
      abs = canonicalizeMaiUrl(new URL(href, baseUrl).toString());
    } catch {
      continue;
    }
    if (new URL(abs).hostname.toLowerCase() !== MAI_COURSE_HOST) {
      continue;
    }
    if (!seen.has(abs)) {
      seen.add(abs);
      out.push(abs);
    }
  }
  return out;
}

function looksLikePagePath(url: string): boolean {
  const path = new URL(url).pathname.toLowerCase();
  return !SKIP_PAGE_EXT.some((ext) => path.endsWith(ext));
}

/**
 * Crawl course root + same-course depth-1 HTML pages for PDF URLs.
 */
export async function crawlCoursePdfs(
  root: MaiCourseRoot,
  options: { maxPdfs: number; delayMs?: number } = { maxPdfs: 60 },
): Promise<string[]> {
  const delayMs = options.delayMs ?? 150;
  const { rootUrl, coursePrefix } = root;

  const rootFetch = await fetchCourseResource(rootUrl, coursePrefix);
  const rootHtml = new TextDecoder("utf-8", { fatal: false }).decode(
    rootFetch.body,
  );
  const links = extractLinks(rootHtml, rootFetch.finalUrl);

  const pdfs: string[] = [];
  const seenPdf = new Set<string>();
  const depth1: string[] = [];

  for (const link of links) {
    if (!isUnderCoursePrefix(link, coursePrefix)) {
      continue;
    }
    if (isPdfUrl(link)) {
      if (!seenPdf.has(link)) {
        seenPdf.add(link);
        pdfs.push(link);
        if (pdfs.length >= options.maxPdfs) {
          return pdfs;
        }
      }
      continue;
    }
    if (!looksLikePagePath(link)) {
      continue;
    }
    // Skip the root itself
    const normalized = link.replace(/\/$/, "");
    const rootNorm = rootUrl.replace(/\/$/, "");
    if (normalized === rootNorm) {
      continue;
    }
    depth1.push(link);
  }

  for (const page of depth1) {
    if (pdfs.length >= options.maxPdfs) {
      break;
    }
    try {
      const pageFetch = await fetchCourseResource(page, coursePrefix);
      const ctype = pageFetch.contentType.toLowerCase();
      if (ctype.includes("pdf") || isPdfUrl(pageFetch.finalUrl)) {
        if (!seenPdf.has(pageFetch.finalUrl)) {
          seenPdf.add(pageFetch.finalUrl);
          pdfs.push(pageFetch.finalUrl);
        }
        await sleep(delayMs);
        continue;
      }
      if (!ctype.includes("html") && !ctype.startsWith("text/")) {
        await sleep(delayMs);
        continue;
      }
      const pageHtml = new TextDecoder("utf-8", { fatal: false }).decode(
        pageFetch.body,
      );
      for (const link of extractLinks(pageHtml, pageFetch.finalUrl)) {
        if (!isUnderCoursePrefix(link, coursePrefix) || !isPdfUrl(link)) {
          continue;
        }
        if (!seenPdf.has(link)) {
          seenPdf.add(link);
          pdfs.push(link);
          if (pdfs.length >= options.maxPdfs) {
            break;
          }
        }
      }
    } catch {
      // Skip unreachable depth-1 pages
    }
    await sleep(delayMs);
  }

  return pdfs.slice(0, options.maxPdfs);
}

export function safePdfFileName(url: string, used: Set<string>): string {
  let name = "download.pdf";
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const base = path.split("/").filter(Boolean).pop() ?? "download.pdf";
    name = base;
  } catch {
    // keep default
  }
  if (!name.toLowerCase().endsWith(".pdf")) {
    name += ".pdf";
  }
  name = name.replace(/[^\w.\-()+ ]+/g, "_").replace(/^[\s._]+|[\s._]+$/g, "");
  if (!name || name === ".pdf") {
    name = "download.pdf";
  }
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const stem = name.replace(/\.pdf$/i, "");
  let digest = "dup";
  try {
    // Short stable-ish suffix from URL path
    digest = [...new URL(url).pathname]
      .reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)
      .toString(16)
      .replace("-", "n")
      .slice(0, 8);
  } catch {
    digest = String(used.size);
  }
  const alt = `${stem}-${digest}.pdf`;
  used.add(alt);
  return alt;
}

const PDF_MAGIC = new TextEncoder().encode("%PDF");

export function looksLikePdf(bytes: Uint8Array, contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes("application/pdf")) {
    return true;
  }
  if (bytes.length < 4) {
    return false;
  }
  return (
    bytes[0] === PDF_MAGIC[0] &&
    bytes[1] === PDF_MAGIC[1] &&
    bytes[2] === PDF_MAGIC[2] &&
    bytes[3] === PDF_MAGIC[3]
  );
}

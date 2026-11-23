/** Allowed MAI course-site host (exact). */
export const MAI_COURSE_HOST = "courses.mai.liu.se";

const COURSE_CODE_RE = /^[A-Za-z][A-Za-z0-9]{2,15}$/;
const PDF_PATH_RE = /\.pdf$/i;

export type MaiCourseRoot = {
  /** Canonical https root URL with trailing slash, e.g. https://courses.mai.liu.se/GU/TATA41/ */
  rootUrl: string;
  /** Path prefix including trailing slash, e.g. /GU/TATA41/ */
  coursePrefix: string;
  courseCode: string;
};

/**
 * Parse and validate a MAI course *root* URL.
 * Accepts /GU/CODE, /GU/CODE/, /GU/CODE/index.html only.
 */
export function parseMaiCourseRoot(raw: string): MaiCourseRoot {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("Ange en kurshemside-URL");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("Ogiltig URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Endast http(s)-länkar är tillåtna");
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== MAI_COURSE_HOST) {
    throw new Error(
      `Endast kurshemsidor på ${MAI_COURSE_HOST} är tillåtna`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error("URL:en får inte innehålla inloggningsuppgifter");
  }
  if (parsed.port && parsed.port !== "443" && parsed.port !== "80") {
    throw new Error("URL:en får inte ange en egen port");
  }

  // Normalize path: remove trailing slashes, then optional index.html
  let path = parsed.pathname.replace(/\/+$/, "") || "/";
  if (/\/index\.html$/i.test(path)) {
    path = path.replace(/\/index\.html$/i, "") || "/";
  }

  const segments = path.split("/").filter(Boolean);
  // Expect exactly ["GU", COURSE]
  if (segments.length !== 2 || segments[0]!.toUpperCase() !== "GU") {
    throw new Error(
      "Klistra in kursens startsida (t.ex. https://courses.mai.liu.se/GU/TATA41/), inte en undersida eller PDF",
    );
  }

  const courseCode = segments[1]!;
  if (!COURSE_CODE_RE.test(courseCode)) {
    throw new Error("Ogiltig kurskod i URL:en");
  }

  const coursePrefix = `/GU/${courseCode}/`;
  const rootUrl = `https://${MAI_COURSE_HOST}${coursePrefix}`;

  return { rootUrl, coursePrefix, courseCode };
}

export function isMaiCourseHost(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === MAI_COURSE_HOST;
  } catch {
    return false;
  }
}

/** True if URL is on MAI host and path is under the course prefix (or exact course root). */
export function isUnderCoursePrefix(url: string, coursePrefix: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.hostname.toLowerCase() !== MAI_COURSE_HOST) {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  const path = parsed.pathname || "/";
  const normalizedPrefix = coursePrefix.endsWith("/")
    ? coursePrefix
    : `${coursePrefix}/`;
  const prefixNoSlash = normalizedPrefix.replace(/\/$/, "");
  return (
    path === prefixNoSlash ||
    path === normalizedPrefix ||
    path.startsWith(normalizedPrefix)
  );
}

export function isPdfUrl(url: string): boolean {
  try {
    return PDF_PATH_RE.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Canonicalize a same-course URL to https without fragment. */
export function canonicalizeMaiUrl(url: string): string {
  const parsed = new URL(url);
  parsed.protocol = "https:";
  parsed.hash = "";
  if (parsed.port === "443" || parsed.port === "80") {
    parsed.port = "";
  }
  return parsed.toString();
}

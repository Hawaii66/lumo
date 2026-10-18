const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpeg", ".jpg"]);

export const ROOM_FILE_ACCEPT = "application/pdf,.pdf,image/jpeg,.jpeg,.jpg";

export const ROOM_FILE_TYPE_ERROR =
  "Endast PDF-, JPEG- och JPG-filer är tillåtna";

export const MAX_FILES_PER_ROOM = 200;
export const MAX_FILE_NAME_LENGTH = 200;

export function fileExtension(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return "";
  return lower.slice(dot);
}

export function isAllowedRoomFileName(name: string): boolean {
  return ALLOWED_EXTENSIONS.has(fileExtension(name));
}

export function isAllowedRoomFile(
  name: string,
  contentType: string | null | undefined,
): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct === "application/pdf" || ct === "image/jpeg") {
    return true;
  }
  if (!ct || ct === "application/octet-stream") {
    return isAllowedRoomFileName(name);
  }
  return false;
}

export function isPdfFile(
  name: string,
  contentType: string | null | undefined,
): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct === "application/pdf") {
    return true;
  }
  if (!ct || ct === "application/octet-stream") {
    return fileExtension(name) === ".pdf";
  }
  return false;
}

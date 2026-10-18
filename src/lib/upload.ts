import type { Id } from "../../convex/_generated/dataModel"

export async function uploadFileToStorage(
  file: File,
  generateUploadUrl: () => Promise<string>,
  options?: { fallbackContentType?: string },
): Promise<Id<"_storage">> {
  const uploadUrl = await generateUploadUrl()
  const result = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type":
        file.type || options?.fallbackContentType || "application/octet-stream",
    },
    body: file,
  })
  if (!result.ok) {
    throw new Error(`Kunde inte ladda upp ${file.name}`)
  }
  const { storageId } = (await result.json()) as {
    storageId: Id<"_storage">
  }
  return storageId
}

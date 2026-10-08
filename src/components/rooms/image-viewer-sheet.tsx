import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"

const IMAGE_EXTENSIONS = new Set([".jpeg", ".jpg"])

type ImageViewerSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileName: string | null
  url: string | null
}

export function ImageViewerSheet({
  open,
  onOpenChange,
  fileName,
  url,
}: ImageViewerSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 p-0 !max-w-none">
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle className="truncate" title={fileName ?? undefined}>
            {fileName ?? "Bild"}
          </SheetTitle>
          <SheetDescription>Endast visning</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/30 p-4">
          {!url ? (
            <p className="text-sm text-muted-foreground">
              Filen är otillgänglig.
            </p>
          ) : (
            <img
              key={url}
              src={url}
              alt={fileName ?? "Bildförhandsvisning"}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function isImageFile(name: string) {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf(".")
  if (dot === -1) return false
  return IMAGE_EXTENSIONS.has(lower.slice(dot))
}

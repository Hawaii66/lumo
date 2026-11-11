import { Loader2 } from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { Button } from "~/components/ui/button"

const MIN_CROP_PX = 48
const HANDLE_HIT_PX = 28
const JPEG_QUALITY = 0.92
/** Horizontal inset so the image / crop handles aren't flush with the screen edges. */
const STAGE_INSET_X = 20

type CropRect = {
  x: number
  y: number
  width: number
  height: number
}

type DragEdge =
  | "n"
  | "s"
  | "e"
  | "w"
  | "nw"
  | "ne"
  | "sw"
  | "se"
  | "move"

type ImageCropScreenProps = {
  file: File
  onConfirm: (cropped: File) => void
  onCancel: () => void
  confirming?: boolean
}

type ContainedLayout = {
  offsetX: number
  offsetY: number
  scale: number
  displayW: number
  displayH: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function containedLayout(
  containerW: number,
  containerH: number,
  imageW: number,
  imageH: number,
): ContainedLayout {
  const availW = Math.max(1, containerW - STAGE_INSET_X * 2)
  const scale = Math.min(availW / imageW, containerH / imageH)
  const displayW = imageW * scale
  const displayH = imageH * scale
  return {
    offsetX: (containerW - displayW) / 2,
    offsetY: (containerH - displayH) / 2,
    scale,
    displayW,
    displayH,
  }
}

function cropToDisplay(crop: CropRect, layout: ContainedLayout) {
  return {
    left: layout.offsetX + crop.x * layout.scale,
    top: layout.offsetY + crop.y * layout.scale,
    width: crop.width * layout.scale,
    height: crop.height * layout.scale,
  }
}

async function loadOrientedBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, {
      imageOrientation: "from-image",
    })
  } catch {
    return await createImageBitmap(file)
  }
}

function applyDrag(
  start: CropRect,
  edge: DragEdge,
  dxImage: number,
  dyImage: number,
  imageW: number,
  imageH: number,
): CropRect {
  let { x, y, width, height } = start

  if (edge === "move") {
    x = clamp(x + dxImage, 0, imageW - width)
    y = clamp(y + dyImage, 0, imageH - height)
    return { x, y, width, height }
  }

  if (edge.includes("w")) {
    const nextX = clamp(x + dxImage, 0, x + width - MIN_CROP_PX)
    width = width + (x - nextX)
    x = nextX
  }
  if (edge.includes("e")) {
    width = clamp(width + dxImage, MIN_CROP_PX, imageW - x)
  }
  if (edge.includes("n")) {
    const nextY = clamp(y + dyImage, 0, y + height - MIN_CROP_PX)
    height = height + (y - nextY)
    y = nextY
  }
  if (edge.includes("s")) {
    height = clamp(height + dyImage, MIN_CROP_PX, imageH - y)
  }

  return { x, y, width, height }
}

export function ImageCropScreen({
  file,
  onConfirm,
  onCancel,
  confirming = false,
}: ImageCropScreenProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const bitmapRef = useRef<ImageBitmap | null>(null)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(
    null,
  )
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [layout, setLayout] = useState<ContainedLayout | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    async function load() {
      setLoadError(null)
      try {
        const bitmap = await loadOrientedBitmap(file)
        if (cancelled) {
          bitmap.close()
          return
        }
        bitmapRef.current = bitmap

        const canvas = document.createElement("canvas")
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          throw new Error("Kunde inte läsa bilden")
        }
        ctx.drawImage(bitmap, 0, 0)
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) => {
              if (result) resolve(result)
              else reject(new Error("Kunde inte läsa bilden"))
            },
            "image/jpeg",
            JPEG_QUALITY,
          )
        })
        objectUrl = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          objectUrl = null
          bitmap.close()
          return
        }
        setPreviewUrl(objectUrl)
        setImageSize({ w: bitmap.width, h: bitmap.height })
        setCrop({
          x: 0,
          y: 0,
          width: bitmap.width,
          height: bitmap.height,
        })
      } catch {
        if (!cancelled) {
          setLoadError("Kunde inte läsa bilden")
        }
      }
    }

    void load()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      bitmapRef.current?.close()
      bitmapRef.current = null
    }
  }, [file])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !imageSize) return

    function measure() {
      if (!stage || !imageSize) return
      const rect = stage.getBoundingClientRect()
      setLayout(
        containedLayout(rect.width, rect.height, imageSize.w, imageSize.h),
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [imageSize])

  function startDrag(edge: DragEdge, event: ReactPointerEvent) {
    if (!crop || confirming || exporting || !layout || !imageSize) return
    event.preventDefault()
    event.stopPropagation()

    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    const startCrop = crop
    const scale = layout.scale
    const imageW = imageSize.w
    const imageH = imageSize.h
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(pointerId)

    function onMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return
      const dxImage = (moveEvent.clientX - startX) / scale
      const dyImage = (moveEvent.clientY - startY) / scale
      setCrop(applyDrag(startCrop, edge, dxImage, dyImage, imageW, imageH))
    }

    function onUp(upEvent: PointerEvent) {
      if (upEvent.pointerId !== pointerId) return
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        // Already released.
      }
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }

  async function handleConfirm() {
    if (!crop || !imageSize || confirming || exporting) return
    const bitmap = bitmapRef.current
    if (!bitmap) return

    setExporting(true)
    try {
      const canvas = document.createElement("canvas")
      const width = Math.max(1, Math.round(crop.width))
      const height = Math.max(1, Math.round(crop.height))
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        throw new Error("Kunde inte beskära bilden")
      }
      ctx.drawImage(
        bitmap,
        Math.round(crop.x),
        Math.round(crop.y),
        width,
        height,
        0,
        0,
        width,
        height,
      )

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => {
            if (result) resolve(result)
            else reject(new Error("Kunde inte beskära bilden"))
          },
          "image/jpeg",
          JPEG_QUALITY,
        )
      })

      const baseName = file.name.replace(/\.[^.]+$/, "") || `foto-${Date.now()}`
      onConfirm(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }))
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Kunde inte beskära bilden")
    } finally {
      setExporting(false)
    }
  }

  const busy = confirming || exporting
  const displayCrop = crop && layout ? cropToDisplay(crop, layout) : null

  return (
    <main className="flex min-h-svh flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-sm text-white/80">
          Dra kanterna för att fokusera in på uppgiften
        </p>
      </div>

      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
      >
        {previewUrl && layout ? (
          <>
            <img
              src={previewUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{
                left: layout.offsetX,
                top: layout.offsetY,
                width: layout.displayW,
                height: layout.displayH,
              }}
            />

            {displayCrop ? (
              <>
                <div
                  className="pointer-events-none absolute bg-black/55"
                  style={{
                    left: 0,
                    top: 0,
                    right: 0,
                    height: Math.max(0, displayCrop.top),
                  }}
                />
                <div
                  className="pointer-events-none absolute bg-black/55"
                  style={{
                    left: 0,
                    top: displayCrop.top + displayCrop.height,
                    right: 0,
                    bottom: 0,
                  }}
                />
                <div
                  className="pointer-events-none absolute bg-black/55"
                  style={{
                    left: 0,
                    top: displayCrop.top,
                    width: Math.max(0, displayCrop.left),
                    height: displayCrop.height,
                  }}
                />
                <div
                  className="pointer-events-none absolute bg-black/55"
                  style={{
                    left: displayCrop.left + displayCrop.width,
                    top: displayCrop.top,
                    right: 0,
                    height: displayCrop.height,
                  }}
                />

                <div
                  className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                  style={{
                    left: displayCrop.left,
                    top: displayCrop.top,
                    width: displayCrop.width,
                    height: displayCrop.height,
                  }}
                  onPointerDown={(event) => startDrag("move", event)}
                >
                  <EdgeHandle edge="n" onPointerDown={startDrag} />
                  <EdgeHandle edge="s" onPointerDown={startDrag} />
                  <EdgeHandle edge="e" onPointerDown={startDrag} />
                  <EdgeHandle edge="w" onPointerDown={startDrag} />
                  <CornerHandle edge="nw" onPointerDown={startDrag} />
                  <CornerHandle edge="ne" onPointerDown={startDrag} />
                  <CornerHandle edge="sw" onPointerDown={startDrag} />
                  <CornerHandle edge="se" onPointerDown={startDrag} />
                </div>
              </>
            ) : null}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/70">
            {loadError ? (
              loadError
            ) : (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Förbereder…
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 flex-1 border-white/30 bg-transparent text-base text-white hover:bg-white/10 hover:text-white"
          disabled={busy}
          onClick={onCancel}
        >
          Avbryt
        </Button>
        <Button
          type="button"
          size="lg"
          className="h-12 flex-1 text-base"
          disabled={busy || !crop || !!loadError}
          onClick={() => void handleConfirm()}
        >
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? "Laddar upp…" : "Använd"}
        </Button>
      </div>
    </main>
  )
}

function EdgeHandle({
  edge,
  onPointerDown,
}: {
  edge: "n" | "s" | "e" | "w"
  onPointerDown: (edge: DragEdge, event: ReactPointerEvent) => void
}) {
  const isHorizontal = edge === "n" || edge === "s"
  return (
    <div
      role="presentation"
      className="absolute z-10"
      style={
        isHorizontal
          ? {
              left: HANDLE_HIT_PX,
              right: HANDLE_HIT_PX,
              height: HANDLE_HIT_PX,
              top: edge === "n" ? -HANDLE_HIT_PX / 2 : undefined,
              bottom: edge === "s" ? -HANDLE_HIT_PX / 2 : undefined,
              cursor: "ns-resize",
            }
          : {
              top: HANDLE_HIT_PX,
              bottom: HANDLE_HIT_PX,
              width: HANDLE_HIT_PX,
              left: edge === "w" ? -HANDLE_HIT_PX / 2 : undefined,
              right: edge === "e" ? -HANDLE_HIT_PX / 2 : undefined,
              cursor: "ew-resize",
            }
      }
      onPointerDown={(event) => onPointerDown(edge, event)}
    >
      <div
        className="pointer-events-none absolute rounded-full bg-white"
        style={
          isHorizontal
            ? {
                left: "50%",
                top: "50%",
                width: 40,
                height: 4,
                transform: "translate(-50%, -50%)",
              }
            : {
                left: "50%",
                top: "50%",
                width: 4,
                height: 40,
                transform: "translate(-50%, -50%)",
              }
        }
      />
    </div>
  )
}

function CornerHandle({
  edge,
  onPointerDown,
}: {
  edge: "nw" | "ne" | "sw" | "se"
  onPointerDown: (edge: DragEdge, event: ReactPointerEvent) => void
}) {
  const top = edge.includes("n")
  const left = edge.includes("w")
  return (
    <div
      role="presentation"
      className="absolute z-20"
      style={{
        width: HANDLE_HIT_PX,
        height: HANDLE_HIT_PX,
        top: top ? -HANDLE_HIT_PX / 2 : undefined,
        bottom: top ? undefined : -HANDLE_HIT_PX / 2,
        left: left ? -HANDLE_HIT_PX / 2 : undefined,
        right: left ? undefined : -HANDLE_HIT_PX / 2,
        cursor:
          edge === "nw" || edge === "se" ? "nwse-resize" : "nesw-resize",
      }}
      onPointerDown={(event) => onPointerDown(edge, event)}
    >
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/40 bg-white" />
    </div>
  )
}

import { useMutation, useQuery } from "convex/react"
import { useEffect, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "~/components/ui/button"
import { Label } from "~/components/ui/label"
import { Textarea } from "~/components/ui/textarea"

const MAX_GENERAL_INFO_LENGTH = 4000

type RoomSettingsPanelProps = {
  roomId: Id<"rooms">
}

export function RoomSettingsPanel({ roomId }: RoomSettingsPanelProps) {
  const room = useQuery(api.rooms.get, { roomId })
  const updateGeneralInfo = useMutation(api.rooms.updateGeneralInfo)

  const [generalInfo, setGeneralInfo] = useState("")
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    if (room === undefined || room === null || dirty) return
    setGeneralInfo(room.generalInfo)
  }, [room, dirty])

  useEffect(() => {
    if (!savedFlash) return
    const id = window.setTimeout(() => setSavedFlash(false), 2000)
    return () => window.clearTimeout(id)
  }, [savedFlash])

  if (room === undefined) {
    return <p className="text-sm text-muted-foreground">Hämtar inställningar…</p>
  }

  if (room === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Rummet hittades inte eller så saknar du åtkomst.
      </p>
    )
  }

  async function handleSave() {
    setError(null)
    setPending(true)
    try {
      await updateGeneralInfo({ roomId, generalInfo })
      setDirty(false)
      setSavedFlash(true)
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Kunde inte spara informationen",
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h2 className="text-lg font-medium">Inställningar</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Information och preferenser för det här rummet.
      </p>

      <div className="mt-6 space-y-2">
        <Label htmlFor="room-general-info">
          Allmän beskrivning och information
        </Label>
        <p className="text-sm text-muted-foreground">
          Skriv fritt till AI:n för det här rummet — till exempel vilka metoder
          den ska föredra, kurskontext eller andra instruktioner.
        </p>
        <Textarea
          id="room-general-info"
          value={generalInfo}
          maxLength={MAX_GENERAL_INFO_LENGTH}
          onChange={(e) => {
            setGeneralInfo(e.target.value)
            setDirty(true)
            setSavedFlash(false)
          }}
          placeholder="T.ex. Föredra substitutionsmetoden framför partialbråk när det går. Kursen är SF1626…"
          className="min-h-40 border-2 border-border bg-background"
        />
        <p className="text-xs text-muted-foreground text-right">
          {generalInfo.length}/{MAX_GENERAL_INFO_LENGTH}
        </p>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex items-center gap-3">
        <Button
          type="button"
          disabled={pending || !dirty}
          onClick={() => void handleSave()}
        >
          {pending ? "Sparar…" : "Spara"}
        </Button>
        {savedFlash ? (
          <span className="text-sm text-muted-foreground">Sparat</span>
        ) : null}
      </div>
    </div>
  )
}

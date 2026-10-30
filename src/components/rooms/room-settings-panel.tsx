import { useMutation, useQuery } from "convex/react"
import {
  Archive,
  ArchiveRestore,
  Loader2,
  
  Plus,
  Settings2,
  Trash2,
  UserMinus,
  UserPlus
} from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { api } from "../../../convex/_generated/api"
import type {LucideIcon} from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Textarea } from "~/components/ui/textarea"
import { cn } from "~/lib/utils"

const MAX_FIELD_LENGTH = 50
const MAX_GENERAL_INFO_LENGTH = 4000

type SettingsTab = "general" | "archived"

const SETTINGS_TABS: Array<{
  id: SettingsTab
  label: string
  icon: LucideIcon
}> = [
  { id: "general", label: "Allmänt", icon: Settings2 },
  { id: "archived", label: "Arkiverade", icon: Archive },
]

type RoomSettingsPanelProps = {
  roomId: Id<"rooms">
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp))
}

export function RoomSettingsPanel({ roomId }: RoomSettingsPanelProps) {
  const navigate = useNavigate()
  const room = useQuery(api.rooms.get, { roomId })
  const members = useQuery(api.rooms.listMembers, { roomId })
  const archivedThreads = useQuery(api.threads.listArchivedByRoom, { roomId })
  const updateRoom = useMutation(api.rooms.update)
  const addMemberByEmail = useMutation(api.rooms.addMemberByEmail)
  const removeMember = useMutation(api.rooms.removeMember)
  const unarchiveThread = useMutation(api.threads.unarchive)
  const inUseCells = useQuery(api.PDFParse.pdfInfo.listInUseByRoom, { roomId })
  const availableCells = useQuery(api.PDFParse.pdfInfo.listAvailableByRoom, {
    roomId,
  })
  const addInfoCell = useMutation(api.PDFParse.pdfInfo.addToRoom)
  const removeInfoCell = useMutation(api.PDFParse.pdfInfo.removeFromRoom)
  const publishedTemplates = useQuery(api.roomTemplates.listBySourceRoom, {
    roomId,
  })
  const publishFromRoom = useMutation(api.roomTemplates.publishFromRoom)
  const setExpired = useMutation(api.roomTemplates.setExpired)
  const removeRoom = useMutation(api.rooms.remove)

  const [tab, setTab] = useState<SettingsTab>("general")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [generalInfo, setGeneralInfo] = useState("")
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [detailsSaved, setDetailsSaved] = useState(false)
  const [detailsPending, setDetailsPending] = useState(false)
  const [detailsDirty, setDetailsDirty] = useState(false)

  const [memberEmail, setMemberEmail] = useState("")
  const [memberError, setMemberError] = useState<string | null>(null)
  const [memberPending, setMemberPending] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<Id<"users"> | null>(
    null,
  )
  const [unarchivingThreadId, setUnarchivingThreadId] = useState<string | null>(
    null,
  )
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [infoBusyHash, setInfoBusyHash] = useState<string | null>(null)

  const [templateError, setTemplateError] = useState<string | null>(null)
  const [publishPending, setPublishPending] = useState(false)
  const [expireTemplateId, setExpireTemplateId] =
    useState<Id<"roomTemplates"> | null>(null)
  const [replacementSearch, setReplacementSearch] = useState("")
  const [replacementQuery, setReplacementQuery] = useState("")
  const [selectedReplacementId, setSelectedReplacementId] = useState<
    Id<"roomTemplates"> | null
  >(null)
  const [expirePending, setExpirePending] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const replacementCandidates = useQuery(
    api.roomTemplates.search,
    expireTemplateId !== null ? { query: replacementQuery } : "skip",
  )

  useEffect(() => {
    if (room == null || detailsDirty) return
    setName(room.name)
    setDescription(room.description)
    setGeneralInfo(room.generalInfo)
  }, [room, detailsDirty])

  if (room === undefined) {
    return (
      <p className="text-sm text-muted-foreground">Hämtar inställningar…</p>
    )
  }

  if (room === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Rummet hittades inte eller så saknar du åtkomst.
      </p>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium">Inställningar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rummets detaljer, medlemmar och arkiverade chattar.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Inställningar"
        className="grid grid-cols-2 gap-0.5 rounded-lg bg-muted/60 p-0.5"
      >
        {SETTINGS_TABS.map((item) => {
          const Icon = item.icon
          const selected = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md px-1 py-2 text-[10px] font-medium tracking-wide uppercase transition-colors",
                selected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTab(item.id)}
            >
              <Icon className="size-3.5" />
              {item.label}
            </button>
          )
        })}
      </div>

      {tab === "general" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Detaljer</CardTitle>
              <CardDescription>
                Namn och beskrivning (max {MAX_FIELD_LENGTH} tecken). Allmän
                information till AI:n får vara längre.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  setDetailsError(null)
                  setDetailsSaved(false)
                  setDetailsPending(true)
                  void updateRoom({
                    roomId,
                    name,
                    description,
                    generalInfo,
                  })
                    .then(() => {
                      setDetailsDirty(false)
                      setDetailsSaved(true)
                    })
                    .catch((err: unknown) => {
                      setDetailsError(
                        err instanceof Error
                          ? err.message
                          : "Kunde inte spara ändringar",
                      )
                    })
                    .finally(() => setDetailsPending(false))
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="settings-room-name">Namn</Label>
                  <Input
                    id="settings-room-name"
                    value={name}
                    maxLength={MAX_FIELD_LENGTH}
                    onChange={(e) => {
                      setName(e.target.value)
                      setDetailsDirty(true)
                      setDetailsSaved(false)
                    }}
                    required
                    className="border-2 border-border bg-background"
                  />
                  <p className="text-right text-xs text-muted-foreground">
                    {name.length}/{MAX_FIELD_LENGTH}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="settings-room-description">Beskrivning</Label>
                  <Textarea
                    id="settings-room-description"
                    value={description}
                    maxLength={MAX_FIELD_LENGTH}
                    onChange={(e) => {
                      setDescription(e.target.value)
                      setDetailsDirty(true)
                      setDetailsSaved(false)
                    }}
                    required
                    className="min-h-20 border-2 border-border bg-background"
                  />
                  <p className="text-right text-xs text-muted-foreground">
                    {description.length}/{MAX_FIELD_LENGTH}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="settings-room-general-info">
                    Allmän beskrivning och information
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Skriv fritt till AI:n för det här rummet — till exempel vilka
                    metoder den ska föredra, kurskontext eller andra
                    instruktioner.
                  </p>
                  <Textarea
                    id="settings-room-general-info"
                    value={generalInfo}
                    maxLength={MAX_GENERAL_INFO_LENGTH}
                    onChange={(e) => {
                      setGeneralInfo(e.target.value)
                      setDetailsDirty(true)
                      setDetailsSaved(false)
                    }}
                    placeholder="T.ex. Föredra substitutionsmetoden framför partialbråk när det går. Kursen är SF1626…"
                    className="min-h-40 border-2 border-border bg-background"
                  />
                  <p className="text-right text-xs text-muted-foreground">
                    {generalInfo.length}/{MAX_GENERAL_INFO_LENGTH}
                  </p>
                </div>

                {detailsError ? (
                  <p className="text-sm text-destructive">{detailsError}</p>
                ) : null}
                {detailsSaved && !detailsDirty ? (
                  <p className="text-sm text-muted-foreground">Sparat.</p>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={detailsPending || !detailsDirty}
                  >
                    {detailsPending ? "Sparar…" : "Spara"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kursinformation från PDF:er</CardTitle>
              <CardDescription>
                Vilka metoder som förväntas i kursen (inte enskilda uppgifter).
                Tolka under Filer → Tolka → Tolka kursinformation. Cellerna kan
                inte redigeras; ta bort hela cellen om den inte ska användas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {infoError ? (
                <p className="text-sm text-destructive">{infoError}</p>
              ) : null}

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Används i rummet</h3>
                {inUseCells === undefined ? (
                  <p className="text-sm text-muted-foreground">Hämtar…</p>
                ) : inUseCells.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Inga informationsceller tillagda ännu.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {inUseCells.map((cell) => (
                      <li
                        key={cell.contentHash}
                        className="rounded-md border border-border p-3"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <p
                            className="truncate text-sm font-medium"
                            title={cell.fileName}
                          >
                            {cell.fileName}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="shrink-0 text-muted-foreground"
                            aria-label={`Ta bort information från ${cell.fileName}`}
                            disabled={infoBusyHash !== null}
                            onClick={() => {
                              setInfoError(null)
                              setInfoBusyHash(cell.contentHash)
                              void removeInfoCell({
                                roomId,
                                contentHash: cell.contentHash,
                              })
                                .catch((err: unknown) => {
                                  setInfoError(
                                    err instanceof Error
                                      ? err.message
                                      : "Kunde inte ta bort cellen",
                                  )
                                })
                                .finally(() => setInfoBusyHash(null))
                            }}
                          >
                            {infoBusyHash === cell.contentHash ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Trash2 />
                            )}
                          </Button>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {cell.text.length > 0
                            ? cell.text
                            : "(Tom information)"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Tillgängliga</h3>
                {availableCells === undefined ? (
                  <p className="text-sm text-muted-foreground">Hämtar…</p>
                ) : availableCells.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Inga tolkade PDF:er att lägga till. Tolka kursinformation
                    från en lämplig PDF under Filer.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {availableCells.map((cell) => (
                      <li
                        key={cell.contentHash}
                        className="rounded-md border border-border border-dashed p-3"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <p
                            className="truncate text-sm font-medium"
                            title={cell.fileName}
                          >
                            {cell.fileName}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={infoBusyHash !== null}
                            onClick={() => {
                              setInfoError(null)
                              setInfoBusyHash(cell.contentHash)
                              void addInfoCell({
                                roomId,
                                contentHash: cell.contentHash,
                              })
                                .catch((err: unknown) => {
                                  setInfoError(
                                    err instanceof Error
                                      ? err.message
                                      : "Kunde inte lägga till cellen",
                                  )
                                })
                                .finally(() => setInfoBusyHash(null))
                            }}
                          >
                            {infoBusyHash === cell.contentHash ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Plus />
                            )}
                            Lägg till
                          </Button>
                        </div>
                        <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
                          {cell.text.length > 0
                            ? cell.text
                            : "(Tom information)"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rumsmallar</CardTitle>
              <CardDescription>
                Publicera en ögonblicksbild av rummet (filer, uppgifter via PDF,
                namn, beskrivning och kursinformation) som andra kan söka upp och
                klona. Ändringar i rummet synkas inte till redan klonade rum.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {templateError ? (
                <p className="text-sm text-destructive">{templateError}</p>
              ) : null}

              <Button
                type="button"
                disabled={publishPending}
                onClick={() => {
                  setTemplateError(null)
                  setPublishPending(true)
                  void publishFromRoom({ roomId })
                    .catch((err: unknown) => {
                      setTemplateError(
                        err instanceof Error
                          ? err.message
                          : "Kunde inte publicera mall",
                      )
                    })
                    .finally(() => setPublishPending(false))
                }}
              >
                {publishPending ? "Publicerar…" : "Publicera som mall"}
              </Button>

              {publishedTemplates === undefined ? (
                <p className="text-sm text-muted-foreground">Hämtar mallar…</p>
              ) : publishedTemplates === null ? (
                <p className="text-sm text-muted-foreground">
                  Kunde inte hämta mallar.
                </p>
              ) : publishedTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Inga mallar publicerade från det här rummet ännu.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {publishedTemplates.map((template) => (
                    <li
                      key={template._id}
                      className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate font-medium">{template.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {template.status === "published"
                            ? "Publicerad"
                            : "Utgången"}
                          {` · ${template.fileCount} fil${template.fileCount === 1 ? "" : "er"}`}
                          {` · ${formatDateTime(template.publishedAt)}`}
                        </p>
                        {template.status === "expired" &&
                        template.replacementName ? (
                          <p className="text-xs text-muted-foreground">
                            Ersättning: {template.replacementName}
                          </p>
                        ) : null}
                      </div>
                      {template.status === "published" &&
                      template.isPublisher ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            setTemplateError(null)
                            setExpireTemplateId(template._id)
                            setSelectedReplacementId(null)
                            setReplacementSearch("")
                            setReplacementQuery("")
                          }}
                        >
                          Markera som utgången
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Medlemmar</CardTitle>
              <CardDescription>
                Lägg till personer som redan har ett Lumo-konto, via e-post.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault()
                  setMemberError(null)
                  setMemberPending(true)
                  void addMemberByEmail({
                    roomId,
                    email: memberEmail,
                  })
                    .then(() => setMemberEmail(""))
                    .catch((err: unknown) => {
                      setMemberError(
                        err instanceof Error
                          ? err.message
                          : "Kunde inte lägga till medlem",
                      )
                    })
                    .finally(() => setMemberPending(false))
                }}
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor="settings-member-email">E-post</Label>
                  <Input
                    id="settings-member-email"
                    type="email"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="namn@exempel.se"
                    required
                    className="border-2 border-border bg-background"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={memberPending}
                  className="shrink-0"
                >
                  <UserPlus />
                  {memberPending ? "Lägger till…" : "Lägg till"}
                </Button>
              </form>

              {memberError ? (
                <p className="text-sm text-destructive">{memberError}</p>
              ) : null}

              {members === undefined ? (
                <p className="text-sm text-muted-foreground">
                  Hämtar medlemmar…
                </p>
              ) : members === null ? (
                <p className="text-sm text-muted-foreground">
                  Kunde inte hämta medlemmar.
                </p>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga medlemmar.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {members.map((member) => (
                    <li
                      key={member.userId}
                      className="flex items-center gap-3 px-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {member.name ?? member.email ?? "Okänd användare"}
                          {member.isViewer ? (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              (du)
                            </span>
                          ) : null}
                        </p>
                        {member.email && member.name ? (
                          <p className="truncate text-sm text-muted-foreground">
                            {member.email}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-muted-foreground"
                        aria-label={
                          member.isViewer
                            ? "Lämna rummet"
                            : `Ta bort ${member.name ?? member.email ?? "medlem"}`
                        }
                        disabled={
                          removingUserId !== null || members.length <= 1
                        }
                        onClick={() => {
                          setMemberError(null)
                          setRemovingUserId(member.userId)
                          void removeMember({
                            roomId,
                            userId: member.userId,
                          })
                            .then(() => {
                              if (member.isViewer) {
                                void navigate({ to: "/" })
                              }
                            })
                            .catch((err: unknown) => {
                              setMemberError(
                                err instanceof Error
                                  ? err.message
                                  : "Kunde inte ta bort medlem",
                              )
                            })
                            .finally(() => setRemovingUserId(null))
                        }}
                      >
                        <UserMinus />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Radera rum</CardTitle>
              <CardDescription>
                Tar bort rummet och tillhörande filer, chattar och tvillingar för
                dig och övriga medlemmar. Publicerade mallar påverkas inte.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {deleteError ? (
                <p className="text-sm text-destructive">{deleteError}</p>
              ) : null}
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setDeleteError(null)
                  setDeleteOpen(true)
                }}
              >
                <Trash2 />
                Radera rum
              </Button>
            </CardContent>
          </Card>

          <Dialog
            open={expireTemplateId !== null}
            onOpenChange={(open) => {
              if (!open) {
                setExpireTemplateId(null)
                setSelectedReplacementId(null)
                setReplacementSearch("")
                setReplacementQuery("")
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Markera mall som utgången</DialogTitle>
                <DialogDescription>
                  Utgångna mallar syns inte i sökningen. Rum som klonats från
                  mallen får en banner. Du kan valfritt koppla en ersättningsmall
                  som visas i bannern.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <Label htmlFor="replacement-search">
                  Ersättningsmall (valfritt)
                </Label>
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setReplacementQuery(replacementSearch.trim())
                  }}
                >
                  <Input
                    id="replacement-search"
                    value={replacementSearch}
                    onChange={(e) => setReplacementSearch(e.target.value)}
                    placeholder="Sök publicerad mall…"
                  />
                  <Button type="submit" variant="outline">
                    Sök
                  </Button>
                </form>

                {selectedReplacementId !== null ? (
                  <p className="text-sm text-muted-foreground">
                    Vald ersättning:{" "}
                    {replacementCandidates?.find(
                      (t) => t._id === selectedReplacementId,
                    )?.name ?? selectedReplacementId}
                    {" · "}
                    <button
                      type="button"
                      className="underline-offset-4 hover:underline"
                      onClick={() => setSelectedReplacementId(null)}
                    >
                      Rensa
                    </button>
                  </p>
                ) : null}

                {replacementCandidates === undefined &&
                expireTemplateId !== null ? (
                  <p className="text-sm text-muted-foreground">Hämtar…</p>
                ) : replacementCandidates &&
                  replacementCandidates.length > 0 ? (
                  <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                    {replacementCandidates
                      .filter((t) => t._id !== expireTemplateId)
                      .map((candidate) => (
                        <li key={candidate._id}>
                          <button
                            type="button"
                            className={cn(
                              "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-muted/60",
                              selectedReplacementId === candidate._id
                                ? "bg-muted"
                                : null,
                            )}
                            onClick={() =>
                              setSelectedReplacementId(candidate._id)
                            }
                          >
                            <span className="font-medium">{candidate.name}</span>
                            <span className="text-xs text-muted-foreground line-clamp-1">
                              {candidate.description}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </div>

              {templateError ? (
                <p className="text-sm text-destructive">{templateError}</p>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setExpireTemplateId(null)}
                >
                  Avbryt
                </Button>
                <Button
                  type="button"
                  disabled={expirePending || expireTemplateId === null}
                  onClick={() => {
                    if (expireTemplateId === null) return
                    setTemplateError(null)
                    setExpirePending(true)
                    void setExpired({
                      templateId: expireTemplateId,
                      ...(selectedReplacementId !== null
                        ? { replacementTemplateId: selectedReplacementId }
                        : {}),
                    })
                      .then(() => {
                        setExpireTemplateId(null)
                        setSelectedReplacementId(null)
                      })
                      .catch((err: unknown) => {
                        setTemplateError(
                          err instanceof Error
                            ? err.message
                            : "Kunde inte markera mallen som utgången",
                        )
                      })
                      .finally(() => setExpirePending(false))
                  }}
                >
                  {expirePending ? "Sparar…" : "Markera som utgången"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={deleteOpen}
            onOpenChange={(open) => {
              setDeleteOpen(open)
              if (!open) setDeleteError(null)
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Radera rummet?</DialogTitle>
                <DialogDescription>
                  Detta går inte att ångra. Alla filer och chattar i rummet tas
                  bort. Publicerade mallar från rummet finns kvar.
                </DialogDescription>
              </DialogHeader>
              {deleteError ? (
                <p className="text-sm text-destructive">{deleteError}</p>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteOpen(false)}
                >
                  Avbryt
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deletePending}
                  onClick={() => {
                    setDeleteError(null)
                    setDeletePending(true)
                    void removeRoom({ roomId })
                      .then(() => {
                        setDeleteOpen(false)
                        void navigate({ to: "/" })
                      })
                      .catch((err: unknown) => {
                        setDeleteError(
                          err instanceof Error
                            ? err.message
                            : "Kunde inte radera rummet",
                        )
                      })
                      .finally(() => setDeletePending(false))
                  }}
                >
                  {deletePending ? "Raderar…" : "Radera"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Arkiverade chattar</CardTitle>
            <CardDescription>
              Chattar som arkiverats manuellt eller efter utgångstid. Återställ
              dem för att visa dem i chattlistan igen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {archiveError ? (
              <p className="text-sm text-destructive">{archiveError}</p>
            ) : null}

            {archivedThreads === undefined ? (
              <p className="text-sm text-muted-foreground">
                Hämtar arkiverade chattar…
              </p>
            ) : archivedThreads.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Inga arkiverade chattar.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {archivedThreads.map((thread) => (
                  <li
                    key={thread._id}
                    className="flex items-center gap-3 px-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{thread.title}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        Skapad {formatDateTime(thread._creationTime)}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        Arkiverad {formatDateTime(thread.archivedAt)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={unarchivingThreadId !== null}
                      aria-label={`Återställ ${thread.title}`}
                      onClick={() => {
                        setArchiveError(null)
                        setUnarchivingThreadId(thread.threadId)
                        void unarchiveThread({
                          roomId,
                          threadId: thread.threadId,
                        })
                          .catch((err: unknown) => {
                            setArchiveError(
                              err instanceof Error
                                ? err.message
                                : "Kunde inte återställa chatten",
                            )
                          })
                          .finally(() => setUnarchivingThreadId(null))
                      }}
                    >
                      <ArchiveRestore />
                      {unarchivingThreadId === thread.threadId
                        ? "Återställer…"
                        : "Återställ"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

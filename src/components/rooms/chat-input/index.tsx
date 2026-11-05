import { forwardRef, useImperativeHandle } from "react"
import type { Id } from "../../../../convex/_generated/dataModel"
import { ChatFilePickerDialog } from "~/components/rooms/chat-file-picker-dialog"
import { ComposerTextarea } from "~/components/rooms/composer-textarea"
import { MathInputDialog } from "~/components/rooms/math-input-dialog"
import { MentionedProblems } from "~/components/rooms/mentioned-problems"
import { PhoneUploadDialog } from "~/components/rooms/phone-upload-dialog"
import type { ChatMode } from "~/lib/chat-mode"
import { cn } from "~/lib/utils"
import { ChatInputAttachments } from "./attachments"
import { ChatInputComposerActions } from "./composer-actions"
import { ChatInputMathChips } from "./math-chips"
import { ChatInputMentionTypeahead } from "./mention-typeahead"
import { ChatInputModeMenu } from "./mode-menu"
import { ChatInputSlashTypeahead } from "./slash-typeahead"
import type {
  ChatInputHandle,
  ChatInputSubmitPayload,
  RoomProblemGroup,
} from "./types"
import { useChatInputComposer } from "./use-composer"

export type {
  ChatInputHandle,
  ChatInputSubmitPayload,
  RoomProblemGroup,
} from "./types"

type ChatInputProps = {
  roomId: Id<"rooms">
  /** Room problem tree from the parent subscription (undefined while loading). */
  problemGroups: Array<RoomProblemGroup> | undefined
  onSubmit: (payload: ChatInputSubmitPayload) => Promise<void> | void
  pending?: boolean
  error?: string | null
  placeholder?: string
  className?: string
  /** When set (e.g. problem detail view), used if the prompt has no @mention. */
  defaultProblemId?: Id<"problems">
  /** Current chat mode (thread). Used to highlight selection in /läge. */
  mode?: ChatMode
  /** Persist mode change (thread). Optional — /läge still works locally for draft. */
  onModeChange?: (mode: ChatMode) => void | Promise<void>
  /**
   * Increment to request focus on the composer textarea (e.g. after starting
   * a new chat). Values `undefined` / `0` are ignored.
   */
  focusSignal?: number
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    {
      roomId,
      problemGroups,
      onSubmit,
      pending = false,
      error = null,
      placeholder = "Skriv ett meddelande… @1.2, /formel eller /läge",
      className,
      defaultProblemId,
      mode,
      onModeChange,
      focusSignal,
    },
    ref,
  ) {
    const composer = useChatInputComposer({
      problemGroups,
      onSubmit,
      pending,
      error,
      defaultProblemId,
      mode,
      onModeChange,
      focusSignal,
    })

    useImperativeHandle(ref, () => composer.handle)

    return (
      <div
        className={cn(
          "flex flex-col gap-2 border-t border-border pt-4",
          className,
        )}
      >
        {composer.draftMentions.length > 0 ? (
          <div className="max-h-56 overflow-y-auto">
            <MentionedProblems
              roomId={roomId}
              mentions={composer.draftMentions}
              draft
            />
          </div>
        ) : null}

        <form
          onSubmit={(event) => {
            void composer.handleSubmit(event)
          }}
          className="flex flex-col gap-2"
          onPaste={(event) => {
            if (composer.handlePasteImages(event.clipboardData.files)) {
              event.preventDefault()
            }
          }}
        >
          {composer.displayError ? (
            <p className="text-sm text-destructive">{composer.displayError}</p>
          ) : null}

          <ChatInputAttachments
            pendingImages={composer.pendingImages}
            pendingStorageImages={composer.pendingStorageImages}
            pending={composer.pending}
            onRemoveImage={composer.removeImage}
            onRemoveStorageImage={composer.removeStorageImage}
          />

          <ChatInputMathChips
            drafts={composer.mathDrafts}
            pending={composer.pending}
            onEdit={composer.openMathDialog}
            onRemove={composer.removeMathDraft}
          />

          <div className="relative">
            <ComposerTextarea
              ref={composer.textareaRef}
              value={composer.prompt}
              mathRefs={composer.mathRefNumbers}
              onChange={(e) => {
                composer.handlePromptChange(
                  e.target.value,
                  e.target.selectionStart,
                )
              }}
              onClick={(e) =>
                composer.handleCursorChange(e.currentTarget.selectionStart)
              }
              onKeyUp={(e) =>
                composer.handleCursorChange(e.currentTarget.selectionStart)
              }
              onSelect={(e) =>
                composer.handleCursorChange(e.currentTarget.selectionStart)
              }
              placeholder={placeholder}
              rows={2}
              disabled={composer.pending}
              onKeyDown={composer.handleTextareaKeyDown}
            />
            {composer.showMentionTypeahead ? (
              <ChatInputMentionTypeahead
                options={composer.typeaheadOptions}
                selectedIndex={composer.typeaheadIndex}
                optionRefs={composer.typeaheadOptionRefs}
                onSelect={composer.insertMention}
              />
            ) : null}
            {composer.showSlashTypeahead ? (
              <ChatInputSlashTypeahead
                options={composer.slashOptions}
                selectedIndex={composer.typeaheadIndex}
                optionRefs={composer.typeaheadOptionRefs}
                onSelect={composer.runSlashCommand}
              />
            ) : null}
            {composer.modeMenuOpen ? (
              <ChatInputModeMenu
                activeMode={composer.activeMode}
                selectedIndex={composer.modeMenuIndex}
                optionRefs={composer.modeOptionRefs}
                onSelect={(next) => {
                  void composer.selectMode(next)
                }}
              />
            ) : null}
          </div>

          <ChatInputComposerActions
            pending={composer.pending}
            imagesFull={composer.imagesFull}
            mathFull={composer.mathFull}
            canSend={composer.canSend}
            onOpenFilePicker={() => composer.setFilePickerOpen(true)}
            onOpenPhoneScan={() => composer.setPhoneScanOpen(true)}
            onOpenMath={composer.openMathDialogAtCursor}
          />
        </form>

        <ChatFilePickerDialog
          roomId={roomId}
          open={composer.filePickerOpen}
          onOpenChange={composer.setFilePickerOpen}
          disabled={composer.pending || composer.imagesFull}
          onPickLocalFiles={composer.addImages}
          onPickStorageFile={composer.addStorageFile}
          excludeStorageIds={composer.attachedStorageIds}
        />

        <PhoneUploadDialog
          roomId={roomId}
          open={composer.phoneScanOpen}
          onOpenChange={composer.setPhoneScanOpen}
          showTrigger={false}
          onCompleted={(file) => {
            composer.addStorageFile({
              storageId: file.storageId,
              filename: file.filename,
            })
          }}
        />

        <MathInputDialog
          open={composer.mathDialogOpen}
          onOpenChange={composer.handleMathDialogOpenChange}
          initialLatex={composer.editingDraft?.latex ?? ""}
          onConfirm={composer.handleMathConfirm}
          title={composer.editingDraft ? "Redigera formel" : "Skriv formel"}
          confirmLabel={composer.editingDraft ? "Spara" : "Lägg till"}
        />
      </div>
    )
  },
)

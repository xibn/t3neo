import { CheckIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { memo, useState, type FormEvent, type KeyboardEvent } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import {
  MAX_IMPORTED_PET_NAME_LENGTH,
  normalizeImportedPetName,
  type ImportedPet,
  type ImportedPetId,
} from "./importedPets";
import { previewPetSize, usePreviewMood } from "./PetPreview";
import { PetSprite } from "./PetSprite";

/**
 * A card for an imported pet in Settings → Pets. The preview selects it like
 * the built-in cards; the row below renames or deletes it. Renaming happens
 * in place: Enter or the check saves, Escape or the X gives up. Deleting asks
 * first: the pet and its sheet are gone for good, only a fresh import brings
 * them back.
 */
export const ImportedPetCard = memo(function ImportedPetCard({
  pet,
  selected,
  onSelect,
  onRename,
  onDelete,
}: {
  pet: ImportedPet;
  selected: boolean;
  onSelect: (id: ImportedPetId) => void;
  onRename: (id: ImportedPetId, name: string) => void;
  onDelete: (id: ImportedPetId) => void;
}) {
  const mood = usePreviewMood();
  const [draft, setDraft] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const save = (event?: FormEvent) => {
    event?.preventDefault();
    if (draft === null) return;
    onRename(pet.id, normalizeImportedPetName(draft, pet.name));
    setDraft(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(null);
    }
  };

  return (
    <div
      className={cn(
        "neo-pet-preview neo-imported-pet-card flex min-w-0 flex-col rounded-xl border transition-colors",
        selected ? "border-primary/60 bg-primary/8" : "border-border hover:border-primary/40",
      )}
      data-selected={selected}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Use ${pet.name}`}
        className="flex min-w-0 flex-col items-stretch gap-2 rounded-t-xl px-3 pt-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onSelect(pet.id)}
      >
        <div className="flex h-32 items-end justify-center overflow-hidden">
          <PetSprite pet={pet.id} mood={mood} size={previewPetSize(pet.id)} />
        </div>
        {draft === null ? (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{pet.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {[
                pet.source.author ? `${pet.source.name} by ${pet.source.author}` : pet.source.name,
                pet.source.gallery,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        ) : null}
      </button>
      <div className="flex items-center gap-1 px-3 pt-2 pb-2">
        {draft === null ? (
          <>
            <Button
              size="xs"
              variant="ghost-muted"
              aria-label={`Rename ${pet.name}`}
              onClick={() => setDraft(pet.name)}
            >
              <PencilIcon />
              Rename
            </Button>
            <Button
              size="xs"
              variant="ghost-muted"
              className="ml-auto hover:text-destructive"
              aria-label={`Delete ${pet.name}`}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2Icon />
              Delete
            </Button>
          </>
        ) : (
          <form className="flex w-full min-w-0 items-center gap-1" onSubmit={save}>
            <Input
              nativeInput
              size="compact"
              className="min-w-0 flex-1"
              aria-label="Pet name"
              autoFocus
              maxLength={MAX_IMPORTED_PET_NAME_LENGTH}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={onKeyDown}
            />
            <Button size="icon-xs" variant="ghost" type="submit" aria-label="Save name">
              <CheckIcon />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost-muted"
              type="button"
              aria-label="Cancel renaming"
              onClick={() => setDraft(null)}
            >
              <XIcon />
            </Button>
          </form>
        )}
      </div>
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pet.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The pet and its spritesheet are removed from this app. Import it again from the
              gallery if you change your mind.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete(pet.id);
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
});

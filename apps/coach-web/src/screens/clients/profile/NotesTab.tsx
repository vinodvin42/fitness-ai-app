import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock, NotebookPen, Pencil, Trash2 } from "lucide-react";
import type { CoachNote } from "@fitness-ai-app/types";
import { createClientNote, deleteClientNote, fetchClientNotes, updateClientNote } from "@/api/coachNotes";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { extractErrorMessage } from "@/lib/apiError";
import { dateTimeLabel } from "@/lib/format";

/**
 * Coach Private Notes (R2 Wave 3): the coach's own plain-text notes about
 * this client, never shown to the client. The list is scoped server-side to
 * the calling coach; creating needs an active relationship, reading past
 * notes doesn't.
 */
export function NotesTab({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: notes, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-client-notes", userId],
    queryFn: () => fetchClientNotes(userId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["coach-client-notes", userId] });
  const failure = (titleKey: string) => (err: unknown) =>
    toast.error(t(titleKey), { description: extractErrorMessage(err, t("web.clientProfile.tryAgain")) });

  const createMutation = useMutation({
    mutationFn: () => createClientNote(userId, { body: draft.trim() }),
    onSuccess: () => {
      setDraft("");
      void invalidate();
    },
    onError: failure("web.clientProfile.noteNotSaved"),
  });

  const updateMutation = useMutation({
    mutationFn: (noteId: string) => updateClientNote(userId, noteId, { body: editDraft.trim() }),
    onSuccess: () => {
      setEditingId(null);
      setEditDraft("");
      void invalidate();
    },
    onError: failure("web.clientProfile.noteNotUpdated"),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => deleteClientNote(userId, noteId),
    onSuccess: () => {
      setDeletingId(null);
      void invalidate();
    },
    onError: (err) => {
      setDeletingId(null);
      failure("web.clientProfile.noteNotDeleted")(err);
    },
  });

  const startEdit = (note: CoachNote) => {
    setEditingId(note.id);
    setEditDraft(note.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Lock className="size-4 shrink-0" />
        {t("clients.profile.notesPrivate")}
      </p>

      <Card size="sm">
        <CardContent>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim().length > 0 && !createMutation.isPending) createMutation.mutate();
            }}
          >
            <Label htmlFor="new-note" className="sr-only">
              {t("web.clientProfile.newNoteLabel")}
            </Label>
            <Textarea
              id="new-note"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("clients.profile.notePlaceholder")}
              className="min-h-20"
            />
            <div className="flex justify-end">
              <Button type="submit" className="h-10 w-full md:h-8 md:w-auto" disabled={draft.trim().length === 0 || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="animate-spin" /> : null}
                {t("clients.profile.saveNote")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isLoading ? <ListSkeleton rows={2} /> : null}
      {isError ? <ErrorState onRetry={() => refetch()} message={t("clients.profile.notesError")} /> : null}
      {notes && notes.length === 0 ? <EmptyState icon={NotebookPen} title={t("clients.profile.noNotes")} className="py-8" /> : null}

      {notes && notes.length > 0 ? (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id}>
              <Card size="sm">
                <CardContent>
                  {editingId === note.id ? (
                    <form
                      className="space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editDraft.trim().length > 0 && !updateMutation.isPending) updateMutation.mutate(note.id);
                      }}
                    >
                      <Label htmlFor={`edit-note-${note.id}`} className="sr-only">
                        {t("web.clientProfile.editNoteLabel")}
                      </Label>
                      <Textarea
                        id={`edit-note-${note.id}`}
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        autoFocus
                        className="min-h-20"
                      />
                      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
                        <Button type="button" variant="outline" className="h-10 md:h-8" onClick={cancelEdit} disabled={updateMutation.isPending}>
                          {t("common.cancel")}
                        </Button>
                        <Button type="submit" className="h-10 md:h-8" disabled={editDraft.trim().length === 0 || updateMutation.isPending}>
                          {updateMutation.isPending ? <Loader2 className="animate-spin" /> : null}
                          {t("common.save")}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground tabular-nums">{dateTimeLabel(note.updatedAt)}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-10 md:h-7" onClick={() => startEdit(note)}>
                            <Pencil />
                            {t("web.clientProfile.edit")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-10 text-destructive hover:text-destructive md:h-7"
                            onClick={() => setDeletingId(note.id)}
                          >
                            <Trash2 />
                            {t("web.clientProfile.delete")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDialog
        open={deletingId != null}
        onOpenChange={(open) => (open || deleteMutation.isPending ? null : setDeletingId(null))}
        title={t("web.clientProfile.deleteNoteTitle")}
        description={t("web.clientProfile.deleteNoteBody")}
        confirmLabel={t("web.clientProfile.delete")}
        onConfirm={() => deletingId && deleteMutation.mutate(deletingId)}
        destructive
        pending={deleteMutation.isPending}
      />
    </div>
  );
}

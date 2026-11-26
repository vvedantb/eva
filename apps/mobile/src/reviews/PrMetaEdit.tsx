import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconPencil } from "@tabler/icons-react-native";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetRow,
  SheetTitle,
  Spinner,
  Textarea,
} from "@vvedantb/native-ui/primitives";
import { SearchInput } from "@vvedantb/native-ui/search-input";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View, type TextInput } from "react-native";
import { FooterSheet } from "@/chat/ComposerFooter";
import { PrAvatar, TEXT_XS } from "@/reviews/ReviewSummary";
import { useScheme } from "@/ui/theme";

type Candidates = FunctionReturnType<typeof api.github.listPullRequestCandidates>;

/** One field of the web metadata column a reader can change: the action it saves with, and its error wording. */
export type MetaField = "reviewers" | "assignees" | "labels";

const FIELD: Record<MetaField, { title: string; error: string; empty: string }> = {
  reviewers: { title: "Reviewers", error: "Couldn't change the reviewers", empty: "No collaborators found." },
  assignees: { title: "Assignees", error: "Couldn't change the assignees", empty: "No collaborators found." },
  labels: { title: "Labels", error: "Couldn't change the labels", empty: "This repository has no labels." },
};

/**
 * The web `usePrMetaEdit`: the candidates (collaborators and labels, one
 * request, read on the first pencil press and kept for the screen) and the
 * three whole-set saves (`github.setPullRequestReviewers`, `…Assignees`,
 * `…Labels`). Each save calls `onSaved`, which reads the overview again, as
 * GitHub is the source of truth; a failure is a toast with GitHub's words.
 */
export function usePrMetaEdit(repoId: Id<"githubRepos">, prNumber: number, onSaved: () => void) {
  const listCandidates = useAction(api.github.listPullRequestCandidates);
  const setReviewers = useAction(api.github.setPullRequestReviewers);
  const setAssignees = useAction(api.github.setPullRequestAssignees);
  const setLabels = useAction(api.github.setPullRequestLabels);
  const [candidates, setCandidates] = useState<Candidates | "loading" | null>(null);
  const [saving, setSaving] = useState<MetaField | null>(null);

  const loadCandidates = () => {
    if (candidates !== null) return;
    setCandidates("loading");
    listCandidates({ repoId }).then(setCandidates, (cause: Error) => {
      setCandidates(null);
      toast.error(cause.message || "Couldn't load the candidates");
    });
  };

  const save = (field: MetaField, next: string[]) => {
    setSaving(field);
    const request =
      field === "reviewers"
        ? setReviewers({ repoId, prNumber, logins: next })
        : field === "assignees"
          ? setAssignees({ repoId, prNumber, logins: next })
          : setLabels({ repoId, prNumber, names: next });
    request.then(
      () => {
        setSaving(null);
        onSaved();
      },
      (cause: Error) => {
        setSaving(null);
        toast.error(cause.message || FIELD[field].error);
      },
    );
  };

  return { candidates: candidates === "loading" ? undefined : (candidates ?? undefined), loading: candidates === "loading", loadCandidates, save, saving };
}

export type PrMetaEditState = ReturnType<typeof usePrMetaEdit>;

/**
 * The web pencil on a metadata row (`PrMetaEditor`) and its picker, as a
 * bottom sheet: a search field over every candidate, the ones set now ticked.
 * A row toggles one and saves the whole set at once, as the web (no Save
 * button); the sheet stays open for the next. Rows wait while a save runs, so
 * the next toggle starts from the set GitHub has (chose: the web lets a second
 * toggle start from the stale set).
 */
export function PrMetaEditButton({
  field,
  selected,
  edit,
}: {
  field: MetaField;
  /** What the field holds now: logins, or label names. */
  selected: readonly string[];
  edit: PrMetaEditState;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { title, empty } = FIELD[field];
  const saving = edit.saving === field;
  const query = search.trim().toLowerCase();
  const options: Array<{ value: string; leading: ReactNode }> =
    field === "labels"
      ? (edit.candidates?.labels ?? []).map((label) => ({ value: label.name, leading: <LabelDot color={label.color} /> }))
      : (edit.candidates?.users ?? []).map((user) => ({
          value: user.login,
          leading: <PrAvatar login={user.login} avatarUrl={user.avatarUrl} size={20} />,
        }));
  const shown = options.filter((option) => option.value.toLowerCase().includes(query));
  const toggle = (value: string) =>
    edit.save(field, selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${title.toLowerCase()}`}
        accessibilityState={{ expanded: open, busy: saving }}
        onPress={() => {
          setOpen(true);
          edit.loadCandidates();
        }}
        // A 44 square at the row's end (the web 24 pencil), so it needs no slop.
        className="size-11 items-center justify-center rounded-full active:opacity-70"
      >
        {saving ? <Spinner size="sm" decorative /> : <IconPencil size={13} color={theme.mutedForeground} />}
      </Pressable>
      <FooterSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
        title={title}
        header={
          <View className="px-2">
            <SearchInput
              size="md"
              value={search}
              onChange={setSearch}
              label={`Search ${title.toLowerCase()}`}
              placeholder={`Search ${title.toLowerCase()}…`}
            />
          </View>
        }
      >
        {edit.loading ? (
          <View className="items-center py-6">
            <Spinner size="sm" accessibilityLabel={`Loading ${title.toLowerCase()}`} />
          </View>
        ) : shown.length === 0 ? (
          <Text className="py-6 text-center text-sm" style={{ color: theme.mutedForeground }}>
            {options.length === 0 ? empty : "No results found."}
          </Text>
        ) : (
          shown.map((option) => (
            <SheetRow
              key={option.value}
              leading={option.leading}
              title={option.value}
              active={selected.includes(option.value)}
              multiple
              disabled={edit.saving !== null}
              onPress={() => toggle(option.value)}
            />
          ))
        )}
      </FooterSheet>
    </>
  );
}

/** GitHub label colours are data, not theme tokens, so they stay a dot (the web `LabelDot`). */
export function LabelDot({ color }: { color: string }) {
  return <View className="size-2 rounded-full" style={{ backgroundColor: `#${color}` }} />;
}

/**
 * The web `usePrEdit`: renames a pull request or rewrites its description
 * (`github.updatePullRequest`), then reads the overview again (`onSaved`).
 * The error stays on the form, as the web editors show it.
 */
function usePrEdit(repoId: Id<"githubRepos">, prNumber: number, onSaved: () => void) {
  const updatePr = useAction(api.github.updatePullRequest);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = (fields: { title?: string; body?: string }) => {
    setSaving(true);
    setError(null);
    updatePr({ repoId, prNumber, ...fields }).then(
      () => {
        setSaving(false);
        onSaved();
      },
      (cause: Error) => {
        setSaving(false);
        setError(cause.message || "Couldn't save the change");
      },
    );
  };
  return { save, saving, error, clearError: () => setError(null) };
}

/**
 * The web description editor (`PrDescriptionEditor`, opened by the pencil
 * beside the description) as a bottom sheet: the textarea, the error, "Saved
 * to GitHub as the eva app." and Cancel / Save. The draft starts from the
 * description each time it opens.
 */
export function DescriptionEditSheet({
  open,
  onOpenChange,
  repoId,
  prNumber,
  body,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoId: Id<"githubRepos">;
  prNumber: number;
  body: string;
  onSaved: () => void;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const [draft, setDraft] = useState(body);
  const field = useRef<TextInput>(null);
  const edit = usePrEdit(repoId, prNumber, () => {
    onOpenChange(false);
    onSaved();
  });
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (edit.saving) return;
        onOpenChange(next);
      }}
    >
      <SheetContent
        className="gap-3 px-4"
        onShow={() => {
          setDraft(body);
          edit.clearError();
          field.current?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>Edit description</SheetTitle>
        </SheetHeader>
        <SheetBody contentContainerClassName="gap-3">
          <Textarea
            ref={field}
            accessibilityLabel="Pull request description"
            value={draft}
            onChangeText={setDraft}
            placeholder="Describe this pull request"
            className="min-h-40"
          />
          {edit.error === null ? null : (
            <Text accessibilityRole="alert" style={[TEXT_XS, { color: theme.destructive }]}>
              {edit.error}
            </Text>
          )}
          {/* eva authenticates as its GitHub App, so the edit is the app's, not the reader's. */}
          <Text style={[TEXT_XS, { color: theme.mutedForeground }]}>Saved to GitHub as the eva app.</Text>
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" disabled={edit.saving} onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={edit.saving} disabled={edit.saving} onPress={() => edit.save({ body: draft })}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The web "Rename pull request" dialog (the Reviews sidebar row menu; here
 * the review ⋯ menu): the title field, Return renames, and Rename waits for a
 * changed, non-empty title.
 */
export function RenameDialog({
  open,
  onOpenChange,
  repoId,
  prNumber,
  title,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoId: Id<"githubRepos">;
  prNumber: number;
  title: string;
  onSaved: () => void;
}) {
  const scheme = useScheme();
  const [draft, setDraft] = useState(title);
  const field = useRef<TextInput>(null);
  const edit = usePrEdit(repoId, prNumber, () => {
    onOpenChange(false);
    onSaved();
  });
  const trimmed = draft.trim();
  const canSave = trimmed.length > 0 && trimmed !== title && !edit.saving;
  const submit = () => {
    if (canSave) edit.save({ title: trimmed });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!edit.saving) onOpenChange(next);
      }}
    >
      <DialogContent
        onShow={() => {
          setDraft(title);
          edit.clearError();
          field.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Rename pull request</DialogTitle>
          <DialogDescription>The new title is pushed to GitHub as the eva app.</DialogDescription>
        </DialogHeader>
        <Input
          ref={field}
          accessibilityLabel="Pull request title"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          returnKeyType="done"
        />
        {edit.error === null ? null : (
          <Text accessibilityRole="alert" style={[TEXT_XS, { color: EVA_THEME[scheme].destructive }]}>
            {edit.error}
          </Text>
        )}
        <DialogFooter>
          <Button variant="secondary" disabled={edit.saving} onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={edit.saving} disabled={!canSave} onPress={submit}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@eva/backend";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  Button,
  Surface,
} from "@eva/ui";
import { Markdown } from "@eva/ui/markdown";
import { IconSparkles } from "@tabler/icons-react";
import dayjs from "dayjs";
import {
  useDevChangelogPreview,
  useDevPreviewSearchKey,
} from "@/lib/dev/preview";

export function ChangelogDialog() {
  // Keyed by preview search so reopening `?changelog` resets dismiss without an effect.
  const [dismissedPreviewKey, setDismissedPreviewKey] = useState<string | null>(
    null,
  );
  const previewSearchKey = useDevPreviewSearchKey();
  const isPreview = useDevChangelogPreview();
  const forceShow = isPreview && dismissedPreviewKey !== previewSearchKey;
  const changelog = useQuery(api.changelog.getLatestChangelog);

  const dismiss = useMutation(
    api.changelog.dismissChangelog,
  ).withOptimisticUpdate((localStore) => {
    const current = localStore.getQuery(api.changelog.getLatestChangelog, {});
    if (current) {
      localStore.setQuery(
        api.changelog.getLatestChangelog,
        {},
        {
          ...current,
          show: false,
        },
      );
    }
  });

  if (!changelog) return null;
  if (!changelog.show && !forceShow) return null;

  const weekLabel = dayjs(changelog.publishedAt).format("MMM D, YYYY");

  function handleDismiss() {
    if (isPreview) {
      setDismissedPreviewKey(previewSearchKey);
      return;
    }
    void dismiss();
  }

  return (
    <Dialog open>
      <DialogContent
        hideCloseButton
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        className="max-w-2xl"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <IconSparkles className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle>What&apos;s New</DialogTitle>
              <DialogDescription>Week of {weekLabel}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          <div className="max-h-[60dvh] overflow-y-auto">
            <Surface>
              <Markdown className="text-sm">{changelog.content}</Markdown>
            </Surface>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={handleDismiss}>Yes, I&apos;ve read this</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

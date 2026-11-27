"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useConvex, useMutation } from "convex/react";
import { api } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from "@vvedantb/ui";
import { IconPlus } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";

/** The hub header's "New" button: names a custom automation, then opens it. */
export function NewAutomationButton() {
  const { repoId, basePath } = useRepo();
  const navigate = useNavigate();
  const convex = useConvex();
  const createAutomation = useMutation(api.automations.create);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const close = () => {
    setOpen(false);
    setTitle("");
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    setIsCreating(true);
    try {
      const id = await createAutomation({ repoId, title: title.trim() });
      const created = await convex.query(api.automations.get, { id });
      // Guarded with an if rather than a ternary: React Compiler bails on the
      // whole file when a conditional expression sits inside a try/catch.
      if (!created) {
        setIsCreating(false);
        return;
      }
      const segment = entityPathSegment(created);
      if (!segment) {
        setIsCreating(false);
        return;
      }
      close();
      mutationSuccess("Automation created", "automation-create");
      navigate({
        to: toInternalRepoHref(`${basePath}/automations/${segment}`),
      });
    } catch {
      mutationError("Couldn't create automation", "automation-create");
    }
    setIsCreating(false);
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <IconPlus size={16} />
        New
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (isCreating) return;
          if (!next) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Automation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="e.g., Update dependencies weekly"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && title.trim()) {
                    void handleCreate();
                  }
                }}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={isCreating || !title.trim()}
              >
                {isCreating ? <Spinner size="sm" /> : "Create"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

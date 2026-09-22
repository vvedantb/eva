"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from "@eva/ui";
import { IconUserPlus } from "@tabler/icons-react";
import { userFacingErrorMessage } from "@/lib/utils/convexErrorMessage";

/**
 * `teamMembers.add` throws this when the email belongs to nobody who has ever
 * signed in. "User not found" reads as a bug in Eva rather than as the invite
 * problem it is, so it is the one message rewritten rather than surfaced.
 */
const NO_SUCH_USER = "User not found";
const NO_SUCH_USER_COPY =
  "No Eva account uses that email yet. Ask them to sign in to Eva first.";

/** Invite by email. Owns its own form state; the tab only decides who sees it. */
export function AddTeamMemberDialog({ teamId }: { teamId: Id<"teams"> }) {
  const addMember = useMutation(api.teamMembers.add);
  const [dialog, setDialog] = useState({
    open: false,
    email: "",
    error: "",
    isSubmitting: false,
  });

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      setDialog({ open: false, email: "", error: "", isSubmitting: false });
    } else {
      setDialog((prev) => ({ ...prev, open: true }));
    }
  };

  const handleAddMember = async () => {
    if (!dialog.email.trim()) {
      setDialog((prev) => ({ ...prev, error: "Email is required" }));
      return;
    }

    setDialog((prev) => ({ ...prev, error: "", isSubmitting: true }));

    try {
      await addMember({ teamId, userEmail: dialog.email });
      setDialog({ open: false, email: "", error: "", isSubmitting: false });
    } catch (err) {
      const message = userFacingErrorMessage(
        err instanceof Error ? err : null,
        "Couldn't add that member. Try again.",
      );
      setDialog((prev) => ({
        ...prev,
        error: message === NO_SUCH_USER ? NO_SUCH_USER_COPY : message,
        isSubmitting: false,
      }));
    }
  };

  return (
    <Dialog open={dialog.open} onOpenChange={handleDialogChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <IconUserPlus size={16} className="mr-1.5" />
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            type="email"
            value={dialog.email}
            onChange={(e) =>
              setDialog((prev) => ({
                ...prev,
                email: e.target.value,
                error: "",
              }))
            }
            placeholder="Email address"
            disabled={dialog.isSubmitting}
            onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
          />
          {dialog.error ? (
            <div className="rounded-surface border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{dialog.error}</p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleDialogChange(false)}
            disabled={dialog.isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleAddMember} disabled={dialog.isSubmitting}>
            {dialog.isSubmitting ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

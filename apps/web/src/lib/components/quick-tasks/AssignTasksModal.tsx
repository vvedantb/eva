"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useState } from "react";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Spinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@vvedantb/ui";
import { withMutationToast } from "@/lib/utils/mutationToast";

interface AssignTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTaskIds: Set<Id<"agentTasks">>;
  onSuccess: () => void;
  mode: "pick" | "me";
}

export function AssignTasksModal({
  isOpen,
  onClose,
  selectedTaskIds,
  onSuccess,
  mode,
}: AssignTasksModalProps) {
  const { repoId } = useRepo();
  const updateTask = useMutation(api.agentTasks.update).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.agentTasks.getAllTasks, {
        repoId,
      });
      if (current !== undefined) {
        localStore.setQuery(
          api.agentTasks.getAllTasks,
          { repoId },
          current.map((task) =>
            task._id === args.id
              ? { ...task, assignedTo: args.assignedTo ?? undefined }
              : task,
          ),
        );
      }
    },
  );
  const users = useQuery(api.users.listAll);
  const currentUserId = useQuery(api.auth.me);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const count = selectedTaskIds.size;
  const taskIds = [...selectedTaskIds];

  const currentUser = users?.find((u) => u._id === currentUserId);
  const currentUserName =
    currentUser?.fullName ||
    [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(" ") ||
    "you";

  const handleClose = () => {
    setSelectedUserId("");
    onClose();
  };

  const handleAssign = async (userId: Id<"users">) => {
    setIsLoading(true);
    // Built out here: a ternary inside the `try` bails the React Compiler out
    // of this whole file. See CLAUDE.md.
    const successMessage = `Assigned ${count} task${count === 1 ? "" : "s"}`;
    try {
      await withMutationToast(
        Promise.all(
          taskIds.map((id) => updateTask({ id, assignedTo: userId })),
        ),
        successMessage,
        "Couldn't assign tasks",
        "tasks-bulk-assign",
      );
      setSelectedUserId("");
      onSuccess();
      onClose();
    } catch {
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
  };

  const getUserLabel = (user: {
    _id: Id<"users">;
    firstName?: string;
    lastName?: string;
    fullName?: string;
  }) =>
    user.fullName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    "Unnamed User";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "me"
              ? `Assign ${count} task${count === 1 ? "" : "s"} to yourself?`
              : `Assign ${count} task${count === 1 ? "" : "s"}`}
          </DialogTitle>
          {mode === "me" ? (
            <DialogDescription>
              {count} task{count === 1 ? "" : "s"} will be assigned to{" "}
              <span data-pii>{currentUserName}</span>.
            </DialogDescription>
          ) : (
            <DialogDescription>
              Choose a team member to assign the selected tasks to.
            </DialogDescription>
          )}
        </DialogHeader>
        {mode === "pick" && (
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a user" />
            </SelectTrigger>
            <SelectContent>
              {(users ?? []).map((user) => (
                <SelectItem key={user._id} value={user._id}>
                  <span data-pii>{getUserLabel(user)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (mode === "me" && currentUserId) {
                void handleAssign(currentUserId);
              } else if (mode === "pick" && selectedUserId) {
                const user = users?.find((u) => u._id === selectedUserId);
                if (user) void handleAssign(user._id);
              }
            }}
            disabled={
              isLoading ||
              (mode === "pick" && !selectedUserId) ||
              (mode === "me" && !currentUserId)
            }
          >
            {isLoading && <Spinner size="sm" />}
            {mode === "me" ? "Assign to Me" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

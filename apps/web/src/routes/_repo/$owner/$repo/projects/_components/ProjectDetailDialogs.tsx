import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogBody,
} from "@eva/ui";
import { IconHammer, IconMessage } from "@tabler/icons-react";
import { ProjectChatMessageList } from "@/lib/components/projects/ProjectChatMessageList";
import { withMutationToast } from "@/lib/utils/mutationToast";
import type {
  ParsedProjectSpec,
  ProjectDetailProject,
} from "./projectDetailHelpers";

export function RunEvaDialog({
  open,
  setOpen,
  isStarting,
  setIsStarting,
  startBuild,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  isStarting: boolean;
  setIsStarting: (isStarting: boolean) => void;
  startBuild: () => Promise<unknown>;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setOpen(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run Eva</DialogTitle>
        </DialogHeader>
        <div>
          <p className="text-muted-foreground">
            This will allow Eva to autonomously work through all tasks in
            sequence until the project is fully built.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Best suited for projects with well-defined requirements. If Eva
            makes an error on an earlier task, it may carry forward into
            subsequent tasks.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={isStarting}
            onClick={async () => {
              setIsStarting(true);
              try {
                await withMutationToast(
                  startBuild(),
                  "Build started",
                  "Couldn't start build",
                  "project-build-start",
                );
                setOpen(false);
              } catch {
                setIsStarting(false);
                return;
              }
              setIsStarting(false);
            }}
          >
            <IconHammer size={16} />
            {isStarting ? "Starting..." : "Start cooking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectPlanDialog({
  parsedSpec,
  open,
  onOpenChange,
}: {
  parsedSpec: ParsedProjectSpec;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plan</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-lg">{parsedSpec.title}</h3>
              <p className="text-muted-foreground">{parsedSpec.description}</p>
            </div>
            <div className="space-y-1.5">
              <h4 className="font-medium">
                Tasks ({parsedSpec.tasks.length})
              </h4>
              {parsedSpec.tasks.map((task, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2 bg-muted rounded"
                >
                  <span className="text-muted-foreground font-mono">
                    {i + 1}.
                  </span>
                  <span>{task.title}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectInterviewHistoryDialog({
  conversationHistory,
  open,
  onOpenChange,
}: {
  conversationHistory: ProjectDetailProject["conversationHistory"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="pb-4">
          <DialogTitle>
            <div className="flex items-center gap-2">
              <IconMessage size={20} />
              Interview History
              <span className="text-sm font-normal text-muted-foreground">
                ({conversationHistory.length} messages)
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-3 py-2">
            <ProjectChatMessageList messages={conversationHistory} />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

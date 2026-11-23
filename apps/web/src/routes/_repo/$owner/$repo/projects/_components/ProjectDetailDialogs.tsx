import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@vvedantb/ui";
import { IconMessage } from "@tabler/icons-react";
import { ProjectChatMessageList } from "@/lib/components/projects/ProjectChatMessageList";
import type {
  ParsedProjectSpec,
  ProjectDetailProject,
} from "./projectDetailHelpers";

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
              <h4 className="font-medium">Tasks ({parsedSpec.tasks.length})</h4>
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

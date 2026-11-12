"use client";

import { useState } from "react";
import type { Id } from "@eva/backend";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { cn } from "@eva/ui";
import { MobilePaneSwitcher } from "@/lib/components/MobilePaneSwitcher";
import { ProjectChatTab, type ConversationMessage } from "./ProjectChatTab";
import { ProjectPlanTab } from "./ProjectPlanTab";
import { useUpdateProject } from "./useUpdateProject";
import type { ProjectPhase } from "@/lib/components/projects/ProjectPhaseBadge";

interface ProjectTabsProps {
  projectId: Id<"projects">;
  projectPhase: ProjectPhase;
  /** An interview or spec workflow holds the project (`projects.interview`). */
  interviewRunning: boolean;
  rawInput: string;
  generatedSpec: string | undefined;
  conversationHistory: ConversationMessage[];
  streamingActivity?: string;
  sandboxStartupActivity?: string;
  basePath: string;
  repoId: Id<"githubRepos">;
}

export function ProjectTabs({
  projectId,
  projectPhase,
  interviewRunning,
  rawInput,
  generatedSpec,
  conversationHistory,
  streamingActivity,
  sandboxStartupActivity,
  basePath,
  repoId,
}: ProjectTabsProps) {
  /** Which of the two panes is on screen below `md`. Inert at `md`+. */
  const [mobilePane, setMobilePane] = useState<"left" | "right">("right");
  const updateProject = useUpdateProject(projectId);
  const clearMessagesDb = useMutation(api.projects.clearMessages);
  const addMessageDb = useMutation(api.projects.addMessage);
  const startProjectInterview = useMutation(
    api.projectInterviewWorkflow.startInterview,
  );

  const handleClear = async () => {
    await clearMessagesDb({ id: projectId });
    await updateProject({ id: projectId, phase: "draft" });
  };

  const handleRejectSpec = async (reason: string) => {
    await updateProject({ id: projectId, phase: "draft" });
    await addMessageDb({ id: projectId, role: "user", content: reason });

    await startProjectInterview({
      projectId,
      featureDescription: rawInput,
      previousAnswers: [], // Session persistence provides context
      rejectionReason: reason,
    });
  };

  // Back to `draft` (Clear / Reject) hides the stored spec until the next
  // spec run overwrites it and moves the phase on.
  const specToShow = projectPhase !== "draft" ? generatedSpec : undefined;

  if (!specToShow) {
    return (
      <ProjectChatTab
        projectId={projectId}
        projectPhase={projectPhase}
        interviewRunning={interviewRunning}
        initialMessages={conversationHistory}
        streamingActivity={streamingActivity ?? sandboxStartupActivity}
        rawInput={rawInput}
        onClear={handleClear}
        repoId={repoId}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col md:grid md:grid-cols-2">
      {/* Below `md` the interview and the plan would be two ~350px scroll areas
          stacked on top of each other, so one is on screen at a time. It opens on
          the plan: a spec only exists here once the interview produced one, and
          approving or rejecting it is what the reader came to do. */}
      <div className="shrink-0 md:hidden">
        <MobilePaneSwitcher
          labels={{ left: "Interview", right: "Plan" }}
          showingRight={mobilePane === "right"}
          onSelect={setMobilePane}
        />
      </div>
      <div
        className={cn(
          "overflow-y-auto scrollbar min-h-0 md:block",
          mobilePane === "left" ? "flex-1" : "hidden",
        )}
      >
        <ProjectChatTab
          projectId={projectId}
          projectPhase={projectPhase}
          interviewRunning={interviewRunning}
          initialMessages={conversationHistory}
          streamingActivity={streamingActivity ?? sandboxStartupActivity}
          rawInput={rawInput}
          onClear={handleClear}
          repoId={repoId}
        />
      </div>
      <div
        className={cn(
          "overflow-y-auto scrollbar min-h-0 md:block",
          mobilePane === "right" ? "flex-1" : "hidden",
        )}
      >
        <ProjectPlanTab
          projectId={projectId}
          projectPhase={projectPhase}
          generatedSpec={specToShow}
          basePath={basePath}
          repoId={repoId}
          onRejectSpec={handleRejectSpec}
        />
      </div>
    </div>
  );
}

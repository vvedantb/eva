"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  ActivityTasks,
  Badge,
  Button,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@eva/ui";
import { IconArrowUp } from "@tabler/icons-react";
import { TaskStatusBadge } from "@/lib/components/tasks/TaskStatusBadge";
import {
  TASK_DETAIL_TAB_LIST_CLASS,
  TASK_DETAIL_TAB_TRIGGER_CLASS,
} from "@/lib/components/tasks/_components/task-detail-constants";
import {
  LANDING_MOCK_REPO,
  LANDING_MOCK_RUN_STEPS,
  LANDING_MOCK_TASK_NUMBER,
  LANDING_MOCK_TASK_TITLE,
} from "./landingTaskDetailFixtures";

const MOCK_RUN_ID = "landing-mock-run";
const THREAD_SEPARATOR_CLASS = "bg-foreground/5 dark:bg-foreground/5";

function LandingMockAvatar({
  initials,
  className,
}: {
  initials: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-3xs font-medium text-primary",
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Static task-detail frame using real Eva tab, badge, run, and activity-step UI. */
export function LandingTaskDetailMock() {
  return (
    <div className="landing-mock-frame overflow-hidden rounded-2xl bg-muted/40 p-1.5">
      <div className="flex items-center justify-between gap-3 bg-muted/30 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex shrink-0 items-center gap-1" aria-hidden>
            <span className="size-2 rounded-full bg-foreground/15" />
            <span className="size-2 rounded-full bg-foreground/15" />
            <span className="size-2 rounded-full bg-foreground/15" />
          </div>
          <span className="truncate font-mono text-3xs text-muted-foreground">
            {LANDING_MOCK_REPO}
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="truncate font-mono text-3xs tabular-nums text-muted-foreground/80">
            QT-{LANDING_MOCK_TASK_NUMBER}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className="landing-pulse-dot size-1.5 rounded-full bg-emerald-500"
            aria-hidden
          />
          <span className="text-3xs font-medium text-muted-foreground">
            Sandbox live
          </span>
        </div>
      </div>

      <div className="landing-mock-body space-y-4 rounded-lg bg-background p-4 sm:p-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-balance text-base font-semibold tracking-tight text-foreground sm:text-lg">
              {LANDING_MOCK_TASK_TITLE}
            </h2>
            <TaskStatusBadge status="code_review" />
          </div>
          <p className="text-pretty text-xs text-muted-foreground">
            Branch{" "}
            <span className="font-mono text-foreground/80">
              fix/checkout-postcode
            </span>{" "}
            · PR #142 open
          </p>
        </div>

        <Tabs value="activity" className="w-full">
          <TabsList className={TASK_DETAIL_TAB_LIST_CLASS}>
            <TabsTrigger
              value="activity"
              className={TASK_DETAIL_TAB_TRIGGER_CLASS}
            >
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="mt-4 space-y-4">
            <LandingMockComposer />

            <LandingMockSystemAlert />

            <Accordion type="multiple" defaultValue={[MOCK_RUN_ID]}>
              <AccordionItem
                value={MOCK_RUN_ID}
                className="rounded-surface bg-muted/40 px-3"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="mr-2 flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <LandingMockAvatar
                        initials="YO"
                        className="size-6 text-[9px]"
                      />
                      <span className="truncate text-xs font-medium text-foreground">
                        You
                      </span>
                      <Badge variant="success">made changes</Badge>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        4m 12s
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      12m ago
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ActivityTasks
                    steps={LANDING_MOCK_RUN_STEPS}
                    name="Eva"
                    duration="4m 12s"
                    className="pt-1"
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <LandingMockCommentThread />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function LandingMockComposer() {
  return (
    <div className="overflow-hidden rounded-surface border border-input bg-card">
      <div
        aria-hidden
        className="min-h-14 px-3 py-2.5 text-sm text-muted-foreground"
      >
        Add a comment…
      </div>
      <div className="flex items-center justify-end gap-2 px-2 pb-2">
        <Button
          size="icon"
          className="size-8 rounded-full"
          disabled
          tabIndex={-1}
          aria-hidden
        >
          <IconArrowUp size={16} />
        </Button>
      </div>
    </div>
  );
}

/** Static PR divider — mirrors `SystemAlertMessage` without Tooltip (landing is unauthenticated). */
function LandingMockSystemAlert() {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="max-w-[85%] truncate text-center text-xs font-medium text-muted-foreground sm:max-w-none">
        GitHub opened pull request #142
        <span className="ml-1.5 font-normal text-muted-foreground/70">
          · 12m
        </span>
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function LandingMockCommentThread() {
  return (
    <div className="space-y-3 rounded-surface bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <LandingMockAvatar initials="AK" />
          <span className="truncate text-sm font-medium text-foreground">
            Alex Kim
          </span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">1h ago</span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Can we tighten the error copy when the postcode format is invalid?
      </p>
      <div className="space-y-3 pl-4">
        <Separator className={THREAD_SEPARATOR_CLASS} />
        <div className="flex items-start gap-2">
          <LandingMockAvatar initials="YO" className="size-6 text-[9px]" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">You</span>
              <span className="text-xs text-muted-foreground">45m ago</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              On it — queued a quick task for Eva.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

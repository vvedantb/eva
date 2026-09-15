import { useId, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api, normalizeAIModel } from "@eva/backend";
import type { Doc } from "@eva/backend";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { CronScheduleCard } from "@/lib/components/CronScheduleCard";
import {
  Button,
  Input,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  ModelSelect,
  toast,
  motionFast,
} from "@eva/ui";
import { m } from "motion/react";
import { IconPlayerPlay, IconTrash } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { SettingsStack } from "@/lib/components/settings/SettingsStack";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsField } from "@/lib/components/settings/SettingsField";
import { SettingsToggleRow } from "@/lib/components/settings/SettingsToggleRow";
import { AutomationDeleteDialog } from "./_components/AutomationDeleteDialog";
import { SystemAutomationSettings } from "./_components/SystemAutomationSettings";
import { LatestRun, RunHistory } from "./_components/RunAccordion";
import { useAvailableAiModels } from "@/lib/hooks/useAvailableAiModels";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";
import { isAutomationTab, type AutomationTab } from "@/lib/search-params";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import {
  ConfirmSkipHint,
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

type Automation = Doc<"automations">;

interface AutomationClientProps {
  automation: Automation;
  repoOwner: string;
  repoName: string;
  activeTab: AutomationTab;
}

export function AutomationClient({
  automation,
  repoOwner,
  repoName,
  activeTab,
}: AutomationClientProps) {
  const navigate = useNavigate();
  const { basePath } = useRepo();
  const updateAutomation = useMutation(api.automations.update);
  const runNow = useMutation(api.automations.runNow);
  const runs = useQuery(api.automations.listRuns, {
    automationId: automation._id,
  });
  const hasActiveRun = runs?.some(
    (r) => r.status === "queued" || r.status === "running",
  );

  return (
    <PageWrapper
      comfortable
      insetHeader
      title={
        <div className="flex items-center gap-2 sm:gap-3">
          <MarqueeOnHover className="min-w-0">
            {automation.title}
          </MarqueeOnHover>
          <Switch
            checked={automation.enabled}
            onCheckedChange={(enabled) =>
              catchMutationError(
                updateAutomation({ id: automation._id, enabled }),
                "Couldn't update automation",
                "automation-enabled",
              )
            }
            aria-label={
              automation.enabled ? "Disable automation" : "Enable automation"
            }
          />
        </div>
      }
      headerRight={
        <Button
          size="sm"
          variant="outline"
          disabled={hasActiveRun === true || !automation.description}
          onClick={() =>
            withMutationToast(
              runNow({ automationId: automation._id }),
              "Run started",
              "Couldn't start run",
              "automation-run-now",
            )
          }
        >
          <IconPlayerPlay size={14} />
          Run Now
        </Button>
      }
      tabs={
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            if (isAutomationTab(v)) {
              const segment = entityPathSegment(automation);
              if (!segment) return;
              navigate({
                to: toInternalRepoHref(
                  `${basePath}/automations/${segment}/${v}`,
                ),
              });
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="latest">Latest</TabsTrigger>
            <TabsTrigger value="run-history">Run History</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Keep panes mounted so Settings form state survives tab switches. */}
        <m.div
          initial={false}
          animate={{ opacity: activeTab === "latest" ? 1 : 0 }}
          transition={motionFast}
          className={activeTab !== "latest" ? "hidden" : undefined}
        >
          <LatestRun
            run={runs?.[0]}
            loading={runs === undefined}
            actionsEnabled={automation.actionsEnabled === true}
            repoOwner={repoOwner}
            repoName={repoName}
          />
        </m.div>

        <m.div
          initial={false}
          animate={{ opacity: activeTab === "run-history" ? 1 : 0 }}
          transition={motionFast}
          className={activeTab !== "run-history" ? "hidden" : undefined}
        >
          <RunHistory
            runs={runs?.slice(1)}
            actionsEnabled={automation.actionsEnabled === true}
            repoOwner={repoOwner}
            repoName={repoName}
          />
        </m.div>

        <m.div
          initial={false}
          animate={{ opacity: activeTab === "settings" ? 1 : 0 }}
          transition={motionFast}
          className={activeTab !== "settings" ? "hidden" : undefined}
        >
          {automation.systemKey === undefined ? (
            <SettingsForm
              automation={automation}
              repoOwner={repoOwner}
              repoName={repoName}
            />
          ) : (
            <SystemAutomationSettings
              automation={automation}
              systemKey={automation.systemKey}
              repoOwner={repoOwner}
              repoName={repoName}
            />
          )}
        </m.div>
      </div>
    </PageWrapper>
  );
}

function SettingsForm({
  automation,
  repoOwner,
  repoName,
}: {
  automation: Automation;
  repoOwner: string;
  repoName: string;
}) {
  const { repo, repoId } = useRepo();
  const siblingApps = useQuery(api.githubRepos.listSiblingApps, {
    repoId,
  });
  const isMonorepo =
    repo.parentRepoId !== undefined || (siblingApps?.length ?? 0) > 0;

  const navigate = useNavigate();
  const updateAutomation = useMutation(
    api.automations.update,
  ).withOptimisticUpdate((localStore, args) => {
    if (automation.numId === undefined) return;
    const q = { repoId, numId: automation.numId };
    const current = localStore.getQuery(api.automations.getByNumId, q);
    if (current) {
      const { id: _id, contextRepoId: _contextRepoId, ...fields } = args;
      localStore.setQuery(api.automations.getByNumId, q, {
        ...current,
        ...fields,
      });
    }
  });
  const removeAutomation = useMutation(
    api.automations.remove,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.automations.list, { repoId });
    if (current !== undefined) {
      localStore.setQuery(
        api.automations.list,
        { repoId },
        current.filter((a) => a._id !== args.id),
      );
    }
  });
  // The cron input is a controlled field doing local↔UTC conversion with a
  // live preview, so it needs an editing buffer to save on blur rather than on
  // every keystroke. Every other field reads straight from the automation doc.
  const [cronDraft, setCronDraft] = useState(automation.cronSchedule);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const altHeld = useAltHeld();
  const titleFieldId = useId();
  const promptFieldId = useId();
  const model = normalizeAIModel(automation.model ?? repo.defaultModel);
  const { options: modelOptions } = useAvailableAiModels(repoId, model);

  // Persist a single field change and confirm with one deduped toast.
  const commit = (
    fields: Omit<Parameters<typeof updateAutomation>[0], "id">,
  ) => {
    void updateAutomation({ id: automation._id, ...fields })
      .then(() => toast.success("Saved", { id: "automation-saved" }))
      .catch(() =>
        toast.error("Couldn't save changes", { id: "automation-saved" }),
      );
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await withMutationToast(
        removeAutomation({ id: automation._id }),
        "Automation deleted",
        "Couldn't delete automation",
        "automation-delete",
      );
      navigate({
        to: "/$owner/$repo/automations",
        params: { owner: repoOwner, repo: repoName },
      });
    } catch {
      setIsDeleting(false);
      return;
    }
    setIsDeleting(false);
  };

  return (
    <SettingsStack>
      <CronScheduleCard
        value={cronDraft}
        onChange={setCronDraft}
        onBlurCommit={(v) => {
          if (v !== automation.cronSchedule) commit({ cronSchedule: v });
        }}
      />

      <SettingsSection title="Description" bodyClassName="grid gap-5">
        <SettingsField label="Title" htmlFor={titleFieldId}>
          <Input
            id={titleFieldId}
            placeholder="Automation title"
            defaultValue={automation.title}
            onBlur={(e) => {
              const val = e.target.value;
              if (val !== automation.title) commit({ title: val });
            }}
          />
        </SettingsField>
        <SettingsField
          label="Prompt"
          htmlFor={promptFieldId}
          description="The prompt that will be executed on each run."
        >
          <Textarea
            id={promptFieldId}
            className="min-h-[120px]"
            placeholder="Describe what this automation should do..."
            defaultValue={automation.description}
            onBlur={(e) => {
              const val = e.target.value;
              if (val !== automation.description) commit({ description: val });
            }}
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="Behaviour" bodyVariant="list">
        {isMonorepo ? (
          <SettingsToggleRow
            title="Share across apps"
            description="Show and run this automation from every app in the monorepo."
            action={
              <Switch
                checked={automation.shared === true}
                onCheckedChange={(next) =>
                  commit({ contextRepoId: repoId, shared: next })
                }
                aria-label="Share across apps"
              />
            }
          />
        ) : null}
        <SettingsToggleRow
          title="Report only"
          description="Analyze and report without making code changes, branches, or PRs."
          action={
            <Switch
              checked={automation.readOnly === true}
              onCheckedChange={(next) =>
                commit(
                  next
                    ? { readOnly: true }
                    : { readOnly: false, actionsEnabled: false },
                )
              }
              aria-label="Report only"
            />
          }
        />
        {automation.readOnly === true ? (
          <SettingsToggleRow
            title="Actions"
            description="Parse findings into actionable items you can convert to tasks."
            action={
              <Switch
                checked={automation.actionsEnabled === true}
                onCheckedChange={(next) => commit({ actionsEnabled: next })}
                aria-label="Actions"
              />
            }
          />
        ) : null}
        <SettingsToggleRow
          title="Send email"
          description="Email this automation's run summary to all users when a run succeeds."
          action={
            <Switch
              checked={automation.sendEmail === true}
              onCheckedChange={(next) => commit({ sendEmail: next })}
              aria-label="Send email"
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Model">
        <SettingsField label="Provider and model">
          <ModelSelect
            value={model}
            options={modelOptions}
            onValueChange={(m) => commit({ model: m })}
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        title="Delete automation"
        description="Permanently remove this automation and all its run history."
        bodyVariant="compact"
        bodyClassName="flex justify-end"
      >
        <Button
          variant="destructive"
          size="sm"
          title={skipConfirmTitle("Delete")}
          onClick={(event) =>
            requestConfirm(
              altHeld,
              () => setShowDeleteDialog(true),
              () => {
                void handleDelete();
              },
              event,
            )
          }
        >
          <IconTrash size={14} />
          Delete
          <ConfirmSkipHint />
        </Button>
      </SettingsSection>

      <AutomationDeleteDialog
        automation={
          showDeleteDialog
            ? { id: automation._id, title: automation.title }
            : null
        }
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />
    </SettingsStack>
  );
}

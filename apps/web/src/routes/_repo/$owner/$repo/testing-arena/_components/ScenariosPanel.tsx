"use client";

import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { useAction, useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Button, Input, Spinner, Switch, Textarea } from "@vvedantb/ui";
import {
  IconPencil,
  IconPlus,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

type Scenario = FunctionReturnType<typeof api.arenaScenarios.listByDoc>[number];

/**
 * The Browser tab's stored scenarios: agent drafting, manual add / edit /
 * delete, and the per-doc switch that runs them on every PR.
 */
export function ScenariosPanel({
  docId,
  prRunsEnabled,
  scenarios,
}: {
  docId: Id<"docs">;
  prRunsEnabled: boolean;
  scenarios: Scenario[] | undefined;
}) {
  const draft = useAction(api.arenaActions.draftScenarios);
  const create = useMutation(api.arenaScenarios.create);
  const setPrRuns = useMutation(api.arenaScenarios.setPrRuns);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const handleDraft = async () => {
    setIsDrafting(true);
    try {
      await withMutationToast(
        draft({ docId }),
        "Drafted scenarios from the document",
        "Couldn't draft scenarios",
        "arena-draft-scenarios",
      );
    } catch (error) {
      setIsDrafting(false);
      throw error;
    }
    setIsDrafting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Browser scenarios</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDraft}
            disabled={isDrafting}
          >
            {isDrafting ? <Spinner size="sm" /> : <IconSparkles size={14} />}
            {isDrafting ? "Drafting..." : "Draft with agent"}
          </Button>
          <Button
            size="sm"
            onClick={() => setIsAdding(true)}
            disabled={isAdding}
          >
            <IconPlus size={14} />
            Add scenario
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-surface bg-muted/40 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium">Run on every PR</p>
          <p className="text-xs text-muted-foreground">
            Tests each new commit on open pull requests and reports the result
            as a GitHub check.
          </p>
        </div>
        <Switch
          checked={prRunsEnabled}
          onCheckedChange={(enabled) => {
            catchMutationError(
              setPrRuns({ docId, enabled }),
              "Couldn't update PR runs",
              "arena-pr-runs",
            );
          }}
          aria-label="Run on every PR"
        />
      </div>

      {isAdding ? (
        <ScenarioForm
          initial={{ title: "", instructions: "" }}
          submitLabel="Add"
          onCancel={() => setIsAdding(false)}
          onSubmit={async (values) => {
            await withMutationToast(
              create({ docId, ...values }),
              "Scenario added",
              "Couldn't add scenario",
              "arena-scenario-create",
            );
            setIsAdding(false);
          }}
        />
      ) : null}

      {scenarios === undefined ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : scenarios.length === 0 && !isAdding ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <p className="text-sm">No scenarios yet</p>
          <p className="text-xs mt-1">
            Draft them from this document, or add your own
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {scenarios.map((scenario, index) => (
            <ListEnter key={scenario._id} index={index} fast>
              <ScenarioRow scenario={scenario} />
            </ListEnter>
          ))}
        </div>
      )}
    </div>
  );
}

function ScenarioRow({ scenario }: { scenario: Scenario }) {
  const update = useMutation(api.arenaScenarios.update);
  const remove = useMutation(api.arenaScenarios.remove);
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <ScenarioForm
        initial={{ title: scenario.title, instructions: scenario.instructions }}
        submitLabel="Save"
        onCancel={() => setIsEditing(false)}
        onSubmit={async (values) => {
          await catchMutationError(
            update({ scenarioId: scenario._id, ...values }),
            "Couldn't save scenario",
            "arena-scenario-update",
          );
          setIsEditing(false);
        }}
      />
    );
  }

  return (
    <div className="group rounded-surface bg-muted/40 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium">{scenario.title}</p>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => setIsEditing(true)}
            aria-label="Edit scenario"
          >
            <IconPencil />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => {
              catchMutationError(
                remove({ scenarioId: scenario._id }),
                "Couldn't delete scenario",
                "arena-scenario-remove",
              );
            }}
            aria-label="Delete scenario"
          >
            <IconTrash />
          </Button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
        {scenario.instructions}
      </p>
    </div>
  );
}

function ScenarioForm({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: { title: string; instructions: string };
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: { title: string; instructions: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial.title);
  const [instructions, setInstructions] = useState(initial.instructions);
  const [isSaving, setIsSaving] = useState(false);
  const canSave =
    title.trim().length > 0 && instructions.trim().length > 0 && !isSaving;

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      await onSubmit({ title, instructions });
    } catch (error) {
      setIsSaving(false);
      throw error;
    }
    setIsSaving(false);
  };

  return (
    <form
      className="space-y-2 rounded-surface bg-muted/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) void handleSubmit();
      }}
    >
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Scenario title"
        aria-label="Scenario title"
        autoFocus
      />
      <Textarea
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
        placeholder={
          "1. Open the sign-up page\n2. Fill in a new email and password\n3. Submit the form\nPass when the dashboard shows a welcome message."
        }
        aria-label="Scenario steps and pass condition"
        rows={5}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!canSave}>
          {isSaving ? <Spinner size="sm" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

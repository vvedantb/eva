import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Doc } from "@eva/backend";
import {
  Button,
  Input,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@vvedantb/ui";
import { IconMail, IconSend, IconTrash } from "@tabler/icons-react";
import { HtmlPreviewFrame } from "@/lib/components/docs/_components/HtmlPreviewFrame";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

type RunEmail = NonNullable<Doc<"automationRuns">["email"]>;
type Mode = "preview" | "edit";

/**
 * A run's email. A draft is reviewed here: preview it exactly as recipients
 * get it, edit the subject and markdown body (saved on blur), then send or
 * discard. A sent or discarded email collapses to one line.
 */
export function RunEmailPanel({
  runId,
  email,
}: {
  runId: Doc<"automationRuns">["_id"];
  email: RunEmail;
}) {
  if (email.status !== "draft") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <IconMail size={12} className="shrink-0" />
        <span className="truncate">
          {email.status === "sent" ? "Email sent" : "Email discarded"}:{" "}
          {email.subject}
        </span>
      </p>
    );
  }
  return <EmailDraft runId={runId} email={email} />;
}

function EmailDraft({
  runId,
  email,
}: {
  runId: Doc<"automationRuns">["_id"];
  email: RunEmail;
}) {
  const [mode, setMode] = useState<Mode>("preview");
  const preview = useQuery(api.automations.previewRunEmail, { runId });
  const updateEmail = useMutation(api.automations.updateRunEmail);
  const sendEmail = useMutation(api.automations.sendRunEmail);
  const discardEmail = useMutation(api.automations.discardRunEmail);

  const save = (fields: { subject?: string; body?: string }) => {
    const subject = fields.subject ?? email.subject;
    const body = fields.body ?? email.body;
    if (subject === email.subject && body === email.body) return;
    void catchMutationError(
      updateEmail({ runId, subject, body }),
      "Couldn't save the email",
      "automation-email-save",
    );
  };

  const recipients =
    preview === undefined || preview === null
      ? null
      : `${preview.recipientCount} recipient${preview.recipientCount === 1 ? "" : "s"}`;

  return (
    <div className="space-y-3 rounded-surface bg-muted p-3">
      <div className="flex flex-wrap items-center gap-2">
        <IconMail size={14} className="shrink-0 text-muted-foreground" />
        <p className="text-sm font-medium">Email draft</p>
        <p className="flex-1 text-xs text-muted-foreground">
          Nothing is sent until you click Send.
        </p>
        <Tabs
          value={mode}
          onValueChange={(next) => {
            if (next === "preview" || next === "edit") setMode(next);
          }}
        >
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Hidden, not unmounted: the Preview tab activates on pointer-down,
          and an unmounted field never fires the blur that saves it. */}
      <div className={mode === "edit" ? "space-y-2" : "hidden"}>
        <Input
          aria-label="Subject"
          defaultValue={email.subject}
          onBlur={(e) => save({ subject: e.target.value })}
        />
        <Textarea
          aria-label="Body (markdown)"
          className="min-h-[320px] font-mono text-xs"
          defaultValue={email.body}
          onBlur={(e) => save({ body: e.target.value })}
        />
      </div>
      {mode === "preview" ? (
        <div className="space-y-2">
          <p className="truncate text-sm">
            <span className="text-muted-foreground">Subject: </span>
            {email.subject}
          </p>
          <div className="h-[560px]">
            {preview ? (
              <HtmlPreviewFrame html={preview.html} title="Email preview" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Spinner />
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void withMutationToast(
              discardEmail({ runId }),
              "Email discarded",
              "Couldn't discard the email",
              "automation-email-discard",
            )
          }
        >
          <IconTrash size={14} />
          Discard
        </Button>
        <Button
          size="sm"
          disabled={recipients === null}
          onClick={() =>
            void withMutationToast(
              sendEmail({ runId }),
              "Email sent",
              "Couldn't send the email",
              "automation-email-send",
            )
          }
        >
          <IconSend size={14} />
          {recipients === null ? "Send" : `Send to ${recipients}`}
        </Button>
      </div>
    </div>
  );
}

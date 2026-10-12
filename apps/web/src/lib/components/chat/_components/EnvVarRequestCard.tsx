"use client";

import { useState, type FormEvent } from "react";
import { useAction, useMutation } from "convex/react";
import { m } from "motion/react";
import { api, type Doc } from "@eva/backend";
import { Button, Input, motionFast, Surface } from "@eva/ui";
import { IconCheck, IconMinus, IconShieldCheck } from "@tabler/icons-react";

type EnvVarRequest = Pick<
  Doc<"envVarRequests">,
  "_id" | "key" | "reason" | "scope" | "status"
>;

/**
 * A secret the agent asked for (`request_env_var`). The typed value lives only
 * in this form's state and the save call: it is never logged, toasted or put
 * in the transcript, and the agent hears back only the key and the outcome.
 */
export function EnvVarRequestCard({
  request,
  onReply,
}: {
  request: EnvVarRequest;
  /**
   * Posts the outcome to the agent. Undefined when the chat cannot send right
   * now (archived, or the sandbox is asleep), which disables the card the same
   * way it disables panel buttons.
   */
  onReply?: (message: string) => void;
}) {
  if (request.status !== "pending") {
    const saved = request.status === "saved";
    const Icon = saved ? IconCheck : IconMinus;
    return (
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Icon size={14} className="shrink-0" aria-hidden />
        <span className="truncate">
          <span className="font-mono">{request.key}</span> ·{" "}
          {saved ? `saved to ${request.scope} env vars` : "declined"}
        </span>
      </div>
    );
  }
  return <PendingEnvVarRequestForm request={request} onReply={onReply} />;
}

function PendingEnvVarRequestForm({
  request,
  onReply,
}: {
  request: EnvVarRequest;
  onReply?: (message: string) => void;
}) {
  const save = useAction(api.envVarRequestsActions.save);
  const decline = useMutation(api.envVarRequests.decline);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = submitting || onReply === undefined;

  // Reset is duplicated into the catch instead of using `finally`: React
  // Compiler bails on the whole file when it meets a `finally` clause.
  const send = async (answer: () => Promise<{ reply: string }>) => {
    if (submitting || onReply === undefined) return;
    setSubmitting(true);
    setError(null);
    try {
      const { reply } = await answer();
      // The card turns into its answered row once the query updates.
      setValue("");
      setSubmitting(false);
      onReply(reply);
    } catch (cause) {
      setSubmitting(false);
      setError(
        cause instanceof Error ? cause.message : "Could not save the value.",
      );
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (value.trim().length === 0) return;
    void send(() => save({ requestId: request._id, value }));
  };

  const inputId = `env-var-request-${request._id}`;
  const errorId = `${inputId}-error`;
  const noteId = `${inputId}-note`;

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionFast}
    >
      <Surface density="tight" className="min-w-0 max-w-full">
        <form
          className="flex min-w-0 flex-col gap-3"
          onSubmit={onSubmit}
          autoComplete="off"
          data-testid="env-var-request-card"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <label
              htmlFor={inputId}
              className="font-mono text-sm font-medium text-foreground"
            >
              {request.key}
            </label>
            <p className="text-sm text-muted-foreground">{request.reason}</p>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Input
              id={inputId}
              // Masked text rather than a password field: browsers offer to
              // save any submitted password, and this is not a login.
              type="text"
              className="min-w-0 flex-1 font-mono text-xs [-webkit-text-security:disc]"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              placeholder="Paste the value"
              value={value}
              disabled={disabled}
              aria-invalid={error !== null || undefined}
              aria-describedby={
                error !== null ? `${noteId} ${errorId}` : noteId
              }
              onChange={(event) => setValue(event.currentTarget.value)}
            />
            <Button
              type="submit"
              size="sm"
              disabled={disabled || value.trim().length === 0}
            >
              Save securely
            </Button>
          </div>
          {error !== null ? (
            <p id={errorId} role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p
              id={noteId}
              className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
            >
              <IconShieldCheck size={14} className="shrink-0" aria-hidden />
              Saved encrypted to {request.scope} env vars, never to this chat.
            </p>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={disabled}
              onClick={() =>
                void send(() => decline({ requestId: request._id }))
              }
            >
              Decline
            </Button>
          </div>
        </form>
      </Surface>
    </m.div>
  );
}

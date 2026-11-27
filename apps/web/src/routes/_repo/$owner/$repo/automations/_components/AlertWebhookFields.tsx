import { useId, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  Button,
  CrossfadeIcon,
  Input,
  SettingsField,
  toast,
} from "@vvedantb/ui";
import { IconCheck, IconCopy } from "@tabler/icons-react";

/**
 * Setup for an "Axiom alerts to tasks" install: the webhook URL to paste into
 * an Axiom custom webhook notifier, and its bearer secret. Only the secret's
 * hash is stored, so a new secret is shown here once, until the page closes.
 */
export function AlertWebhookFields({
  automationId,
}: {
  automationId: Id<"automations">;
}) {
  const webhook = useQuery(api.automations.getAlertWebhook, {
    id: automationId,
  });
  const rotate = useMutation(api.automations.rotateAlertSecret);
  // The one moment the plain secret exists in the browser. Never persisted.
  const [freshSecret, setFreshSecret] = useState<string | null>(null);

  if (webhook === undefined || webhook === null) return null;

  const generate = () => {
    void rotate({ id: automationId })
      .then(setFreshSecret)
      .catch(() => toast.error("Couldn't create a secret"));
  };

  return (
    <>
      <CopyField
        label="Webhook URL"
        value={webhook.url ?? "Not available: the backend site URL is not set."}
        copyable={webhook.url !== null}
        description="In Axiom, add a Custom webhook notifier with this URL and the default template. Attach the notifier to the monitors that should open tasks."
      />
      {freshSecret === null ? (
        <SettingsField
          label="Secret"
          description={
            webhook.hasSecret
              ? "A secret is set. A new one replaces it, and the old one stops working at once."
              : "Axiom must send a secret with each alert. Create one, then add it to the notifier."
          }
        >
          <div>
            <Button size="sm" variant="secondary" onClick={generate}>
              {webhook.hasSecret ? "Replace secret" : "Create secret"}
            </Button>
          </div>
        </SettingsField>
      ) : (
        <CopyField
          label="Secret"
          value={`Bearer ${freshSecret}`}
          copyable
          description="Add a header named Authorization with this value to the notifier. Copy it now: Eva shows it only once."
        />
      )}
    </>
  );
}

function CopyField({
  label,
  value,
  copyable,
  description,
}: {
  label: string;
  value: string;
  copyable: boolean;
  description: string;
}) {
  const fieldId = useId();
  const [copied, setCopied] = useState(false);
  return (
    <SettingsField label={label} htmlFor={fieldId} description={description}>
      <div className="flex items-center gap-2">
        <Input
          id={fieldId}
          readOnly
          value={value}
          className="font-mono text-xs"
          onFocus={(e) => e.target.select()}
        />
        {copyable ? (
          <Button
            shape="rounded"
            size="icon-sm"
            variant="ghost"
            className="hit-target"
            title={copied ? "Copied!" : `Copy ${label.toLowerCase()}`}
            aria-label={`Copy ${label.toLowerCase()}`}
            onClick={() => {
              void navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <CrossfadeIcon
              show={copied}
              trueKey="copied"
              falseKey="copy"
              className="relative flex size-3.5 items-center justify-center"
              whenTrue={<IconCheck size={14} className="text-primary" />}
              whenFalse={<IconCopy size={14} />}
            />
          </Button>
        ) : null}
      </div>
    </SettingsField>
  );
}

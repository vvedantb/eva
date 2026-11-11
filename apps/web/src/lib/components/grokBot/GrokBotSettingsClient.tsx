"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@eva/backend";
import {
  Button,
  Input,
  Spinner,
  SettingsField,
  SettingsSection,
  convexErrorMessage,
} from "@vvedantb/ui";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";

export function GrokBotSettingsClient() {
  const settings = useQuery(api.grokBot.getSettings);
  const setWebhook = useAction(api.grokBotActions.setWebhook);
  const clearSettings = useMutation(api.grokBot.clearSettings);

  // The saved URL owns the field until the user types; `null` = untouched.
  // Kept after Save (the action can resolve before the query catches up, so
  // dropping it would flash the old URL); it then equals the saved value.
  const [urlDraft, setUrlDraft] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const url = urlDraft ?? settings?.url ?? "";

  if (settings === undefined) {
    return (
      <SettingsPage title="Grok Bot">
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      </SettingsPage>
    );
  }

  const handleSave = () => {
    void setWebhook({
      url,
      key: key.trim() === "" ? undefined : key,
    })
      .then(() => {
        setKey("");
        mutationSuccess("Grok Bot webhook saved", "grok-bot-webhook");
      })
      .catch((error: unknown) => {
        mutationError(
          convexErrorMessage(error, "Couldn't save webhook"),
          "grok-bot-webhook",
        );
      });
  };

  const handleClear = () => {
    void clearSettings({})
      .then(() => {
        setUrlDraft(null);
        setKey("");
        mutationSuccess("Grok Bot webhook cleared", "grok-bot-webhook-clear");
      })
      .catch((error: unknown) => {
        mutationError(
          convexErrorMessage(error, "Couldn't clear webhook"),
          "grok-bot-webhook-clear",
        );
      });
  };

  return (
    <SettingsPage title="Grok Bot">
      <SettingsSection
        title="Routine webhook"
        description="Paste the webhook from a Grok Bot routine (When to run → Webhook). Eva agents call request_local_computer to start a run. A 200 only means the Bot started — not that local work finished. Local files need the Grok Bot desktop app and local-computer approval."
        footer={
          <div className="flex items-center gap-2">
            {settings.hasKey || settings.url ? (
              <Button size="sm" variant="ghost" onClick={handleClear}>
                Clear
              </Button>
            ) : null}
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        }
      >
        <div className="grid gap-5">
          <SettingsField
            label="POST to"
            htmlFor="grok-bot-webhook-url"
            description="Must be https://api2.cursor.sh/automations/webhook/…"
          >
            <Input
              id="grok-bot-webhook-url"
              type="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://api2.cursor.sh/automations/webhook/…"
              value={url}
              onChange={(event) => setUrlDraft(event.target.value)}
            />
          </SettingsField>
          <SettingsField
            label="Key"
            htmlFor="grok-bot-webhook-key"
            description={
              settings.hasKey
                ? "A key is saved. Leave blank to keep it, or paste a new one."
                : "The routine key. Senders use it as Authorization: Bearer."
            }
          >
            <Input
              id="grok-bot-webhook-key"
              type="password"
              autoComplete="new-password"
              placeholder={settings.hasKey ? "••••••••" : "crsr_…"}
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </SettingsField>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}

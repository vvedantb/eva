import { createFileRoute } from "@tanstack/react-router";
import { GrokBotSettingsClient } from "@/lib/components/grokBot/GrokBotSettingsClient";

export const Route = createFileRoute("/_global/settings/grok-bot")({
  staticData: { title: "Settings" },
  component: GrokBotSettingsClient,
});

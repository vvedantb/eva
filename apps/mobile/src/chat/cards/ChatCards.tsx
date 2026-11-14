import { api, type Doc, type Id } from "@eva/backend";
import { placeChatUiPanels, type PlacementMessage } from "@eva/shared";
import type { ChatFeedbackRow } from "@eva/shared/chatFeedback";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconWorld } from "@tabler/icons-react-native";
import { GenerativeUiPanel } from "@vvedantb/native-ui/generative-ui";
import { MediaCard } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import * as WebBrowser from "expo-web-browser";
import { View } from "react-native";
import { copyText } from "@/ui/copyText";
import { useScheme } from "@/ui/theme";
import { ChatHtmlFrame } from "./ChatHtmlFrame";
import { AgentFeedbackCard, ChatArtifactCard } from "./TurnOutputs";

/** One agent-posted card in the transcript, placed by `placeChatUiPanels`, as the web `ChatBody`. */
export type InlineCard = {
  _id: string;
  messageId?: string;
  createdAt: number;
  card: { kind: "panel"; spec: string } | { kind: "html"; render: Doc<"chatHtmlRenders"> };
};

/** An artifact or agent report, placed by the same rule but kept with the turn's output. */
export type TurnOutput = {
  _id: string;
  messageId?: string;
  createdAt: number;
  output:
    | { kind: "artifact"; artifact: { _id: Id<"artifacts">; name: string; description?: string } }
    | { kind: "report"; report: ChatFeedbackRow };
};

/**
 * The chat's agent-posted cards (`render_ui` panels, `render_html` pages) and
 * turn outputs (`create_artifact` artifacts, `submit_feedback` reports), each
 * placed under its turn, else under the newest row before it, else after the
 * last message, as the web `ChatBody`. One query each per chat; the phone
 * loads the whole history, so nothing waits for older rows. The web's secret
 * request cards (`request_env_var`) are not on the phone yet.
 */
export function useChatCards(
  parentId: Doc<"messages">["parentId"] | undefined,
  rows: readonly PlacementMessage[],
  agentReports: readonly ChatFeedbackRow[],
) {
  const panels = useQuery(api.chatUi.listByParent, parentId ? { parentId } : "skip");
  const htmlRenders = useQuery(api.chatHtml.listByParent, parentId ? { parentId } : "skip");
  const artifacts = useQuery(api.artifacts.listForChat, parentId ? { parentId } : "skip");
  const cards = placeChatUiPanels<InlineCard>(
    [
      ...(panels ?? []).map((panel) => ({
        _id: panel._id,
        messageId: panel.messageId,
        createdAt: panel.createdAt,
        card: { kind: "panel" as const, spec: panel.spec },
      })),
      ...(htmlRenders ?? []).map((render) => ({
        _id: render._id,
        messageId: render.messageId,
        createdAt: render.createdAt,
        card: { kind: "html" as const, render },
      })),
    ],
    rows,
    false,
  );
  const outputs = placeChatUiPanels<TurnOutput>(
    [
      ...(artifacts ?? []).map((artifact) => ({
        _id: artifact._id,
        messageId: artifact.messageId,
        createdAt: artifact.createdAt,
        output: { kind: "artifact" as const, artifact },
      })),
      ...agentReports.map((report) => ({
        _id: report._id,
        messageId: report.messageId,
        createdAt: report.createdAt,
        output: { kind: "report" as const, report },
      })),
    ],
    rows,
    false,
  );
  return { cards, outputs };
}

/** A turn's cards, `gap-2` apart, as the web's `belowContent`. */
export function InlineCards({
  cards,
  rowKey,
  onReply,
  onOpenWebChat,
}: {
  cards: readonly InlineCard[];
  /** The row they sit in, so a page loads once the row is on screen. */
  rowKey: string;
  onReply?: (message: string) => void;
  onOpenWebChat: () => void;
}) {
  return (
    <View className="gap-2">
      {cards.map(({ _id, card }) =>
        card.kind === "panel" ? (
          <GenerativeUiPanel
            key={_id}
            spec={card.spec}
            onReply={onReply}
            onOpenUrl={openInApp}
            onCopy={copyText}
            renderUnsupported={(type) => <OpenOnWebCard type={type} onPress={onOpenWebChat} />}
          />
        ) : (
          <ChatHtmlFrame key={_id} render={card.render} rowKey={rowKey} />
        ),
      )}
    </View>
  );
}

/** A turn's artifacts and reports, `mt-1 gap-2`, as the web's `artifacts`. */
export function TurnOutputs({ outputs }: { outputs: readonly TurnOutput[] }) {
  return (
    <View className="mt-1 gap-2">
      {outputs.map(({ _id, output }) =>
        output.kind === "artifact" ? (
          <ChatArtifactCard key={_id} artifact={output.artifact} />
        ) : (
          <AgentFeedbackCard key={_id} feedback={output.report} />
        ),
      )}
    </View>
  );
}

const openInApp = (url: string) => {
  void WebBrowser.openBrowserAsync(url);
};

/** A panel part this app version cannot draw (a newer catalog): a card that opens the chat on the web, where it renders. */
function OpenOnWebCard({ type, onPress }: { type: string; onPress: () => void }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <MediaCard
      icon={IconWorld}
      title="Open on the web to see this part"
      description={type}
      onPress={onPress}
      backgroundColor={theme.muted}
      color={theme.foreground}
      mutedColor={theme.mutedForeground}
    />
  );
}

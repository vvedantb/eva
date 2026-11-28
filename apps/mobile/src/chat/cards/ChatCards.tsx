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
import { ProjectChatTaskCard } from "@/projects/ProjectChatTaskCard";
import { copyText } from "@/ui/copyText";
import { useScheme } from "@/ui/theme";
import { EnvVarRequestCard, SessionProposalCard } from "./AgentRequestCards";
import { ChatHtmlFrame } from "./ChatHtmlFrame";
import { AgentFeedbackCard, ChatArtifactCard } from "./TurnOutputs";

/** One agent-posted card in the transcript, placed by `placeChatUiPanels`, as the web `ChatBody`. */
export type InlineCard = {
  _id: string;
  messageId?: string;
  createdAt: number;
  card:
    | { kind: "panel"; spec: string }
    | { kind: "html"; render: Doc<"chatHtmlRenders"> }
    | { kind: "envVarRequest"; request: Doc<"envVarRequests"> }
    | { kind: "sessionProposal"; proposal: Doc<"sessionProposals"> };
};

/** An artifact or agent report, placed by the same rule but kept with the turn's output. */
export type TurnOutput = {
  _id: string;
  messageId?: string;
  createdAt: number;
  output:
    | { kind: "artifact"; artifact: { _id: Id<"artifacts">; name: string; description?: string } }
    | { kind: "report"; report: ChatFeedbackRow }
    | { kind: "task"; taskId: Id<"agentTasks">; project: ChatProject };
};

/** A project's coordinator chat: what its task cards read (`ProjectChatTaskCard`). */
export type ChatProject = { projectId: Id<"projects">; repoId: Id<"githubRepos"> };

/**
 * The chat's agent-posted cards (`render_ui` panels, `render_html` pages, a
 * secret the agent asked for, a session it proposes) and
 * turn outputs (`create_artifact` artifacts, `submit_feedback` reports, and
 * in a project's coordinator chat the tasks Eva created or gave work to), each
 * placed under its turn, else under the newest row before it, else after the
 * last message, as the web `ChatBody`. One query each per chat. The
 * transcript loads in pages: while `hasOlderHistory`, a card whose turn is
 * above the loaded rows waits for that page, as the web, instead of falling
 * to the end of the chat.
 */
export function useChatCards(
  parentId: Doc<"messages">["parentId"] | undefined,
  rows: readonly PlacementMessage[],
  agentReports: readonly ChatFeedbackRow[],
  hasOlderHistory: boolean,
  project?: ChatProject,
) {
  const panels = useQuery(api.chatUi.listByParent, parentId ? { parentId } : "skip");
  const htmlRenders = useQuery(api.chatHtml.listByParent, parentId ? { parentId } : "skip");
  const envVarRequests = useQuery(api.envVarRequests.listByParent, parentId ? { parentId } : "skip");
  const sessionProposals = useQuery(api.sessionProposals.listByParent, parentId ? { parentId } : "skip");
  const artifacts = useQuery(api.artifacts.listForChat, parentId ? { parentId } : "skip");
  const taskCards = useQuery(api.projects.listChatTaskCards, project ? { projectId: project.projectId } : "skip");
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
      ...(envVarRequests ?? []).map(
        (request): InlineCard => ({
          _id: request._id,
          messageId: request.messageId,
          createdAt: request.createdAt,
          card: { kind: "envVarRequest", request },
        }),
      ),
      ...(sessionProposals ?? []).map(
        (proposal): InlineCard => ({
          _id: proposal._id,
          messageId: proposal.messageId,
          createdAt: proposal.createdAt,
          card: { kind: "sessionProposal", proposal },
        }),
      ),
    ],
    rows,
    hasOlderHistory,
  );
  const taskOutputs: TurnOutput[] = project
    ? (taskCards ?? []).map((card) => ({
        _id: card.key,
        messageId: card.messageId,
        createdAt: card.createdAt,
        output: { kind: "task", taskId: card.taskId, project },
      }))
    : [];
  const outputs = placeChatUiPanels<TurnOutput>(
    [
      ...(artifacts ?? []).map((artifact) => ({
        _id: artifact._id,
        messageId: artifact.messageId,
        createdAt: artifact.createdAt,
        output: { kind: "artifact" as const, artifact },
      })),
      ...taskOutputs,
      ...agentReports.map((report) => ({
        _id: report._id,
        messageId: report.messageId,
        createdAt: report.createdAt,
        output: { kind: "report" as const, report },
      })),
    ],
    rows,
    hasOlderHistory,
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
  rowKey: string;
  onReply?: (message: string) => void;
  onOpenWebChat: () => void;
}) {
  return (
    <View className="gap-2">
      {cards.map(({ _id, card }) => {
        switch (card.kind) {
          case "panel":
            return (
              <GenerativeUiPanel
                key={_id}
                spec={card.spec}
                onReply={onReply}
                onOpenUrl={openInApp}
                onCopy={copyText}
                renderUnsupported={(type) => <OpenOnWebCard type={type} onPress={onOpenWebChat} />}
              />
            );
          case "html":
            return <ChatHtmlFrame key={_id} render={card.render} rowKey={rowKey} />;
          case "envVarRequest":
            return <EnvVarRequestCard key={_id} request={card.request} onReply={onReply} />;
          case "sessionProposal":
            return <SessionProposalCard key={_id} proposal={card.proposal} onReply={onReply} />;
        }
      })}
    </View>
  );
}

/** A turn's artifacts, reports and task cards, `mt-1 gap-2`, as the web's `artifacts`. */
export function TurnOutputs({ outputs }: { outputs: readonly TurnOutput[] }) {
  return (
    <View className="mt-1 gap-2">
      {outputs.map(({ _id, output }) => {
        switch (output.kind) {
          case "artifact":
            return <ChatArtifactCard key={_id} artifact={output.artifact} />;
          case "report":
            return <AgentFeedbackCard key={_id} feedback={output.report} />;
          case "task":
            return (
              <ProjectChatTaskCard
                key={_id}
                taskId={output.taskId}
                projectId={output.project.projectId}
                repoId={output.project.repoId}
              />
            );
        }
      })}
    </View>
  );
}

const openInApp = (url: string) => {
  void WebBrowser.openBrowserAsync(url);
};

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

import { api, normalizeAIModel, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  buildCollapsedProposedPlanPreviewMarkdown,
  buildPlanImplementationPrompt,
  buildPlanImplementationThreadTitle,
  normalizePlanMarkdownForExport,
  proposedPlanForMessage,
  proposedPlanTitle,
  stripDisplayedPlanMarkdown,
  type ProposedPlanRow,
} from "@eva/shared/proposedPlan";
import { IconCheck, IconCode, IconCopy, IconFileExport } from "@tabler/icons-react-native";
import { Badge, Button } from "@vvedantb/native-ui/primitives";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { palette } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { Chat } from "@/chat/useChatModelPick";
import { useScheme } from "@/ui/theme";

/** A plan longer than this folds to a preview, as the web card (900 characters or 20 lines). */
const FOLD_CHARS = 900;
const FOLD_LINES = 20;

/**
 * The web session chat's proposed plans (`ProposedPlanCard` after the message
 * that proposed each one): `planAfter(messageId)` is the card under that
 * message, or null. Only a session chat has plans, as on the web. Implement
 * sends the web prompt in this chat and marks the plan implemented;
 * Implement in new session starts one on this chat's model and account with
 * the plan as its plan, as the web; Save as Document saves the session's
 * plan as a doc and opens it. A closed chat shows the card without actions.
 */
export function useProposedPlans(chat: Chat | null | undefined): (messageId: string) => ReactNode {
  const router = useRouter();
  const sessionId = chat?.session?.id;
  const plans = useQuery(api.proposedPlans.listBySession, sessionId ? { sessionId } : "skip");
  const linkedDoc = useQuery(api.docs.getBySession, sessionId ? { sessionId } : "skip");
  const send = useMutation(api.chats.send);
  const start = useMutation(api.chats.start);
  const markImplemented = useMutation(api.proposedPlans.markImplemented);
  const updatePlanContent = useMutation(api.sessions.updatePlanContent);
  const createDoc = useMutation(api.docs.createFromSession);
  const [savingDoc, setSavingDoc] = useState(false);

  if (!chat || !sessionId || !plans || plans.length === 0) return () => null;
  const canAct = chat.canReply;

  const implement = (plan: ProposedPlanRow) => {
    send({ target: chat.target, message: buildPlanImplementationPrompt(plan.planMarkdown) })
      .then(() => markImplemented({ planId: plan._id }))
      .catch(() => toast.error("Couldn't send your message"));
  };

  const implementInNewSession = (plan: ProposedPlanRow) => {
    start({
      repoId: chat.repoId,
      prompt: buildPlanImplementationPrompt(plan.planMarkdown),
      title: buildPlanImplementationThreadTitle(plan.planMarkdown),
      model: normalizeAIModel(chat.model),
      providerAccountId: chat.providerAccountId ?? null,
    })
      .then(async ({ sessionId: next }) => {
        await updatePlanContent({ id: next, planContent: plan.planMarkdown });
        await markImplemented({ planId: plan._id, implementationSessionId: next });
        router.push({ pathname: "/chat/[target]", params: { target: next } });
      })
      .catch((cause: Error) => toast.error(cause.message || "Couldn't start new session"));
  };

  const saveAsDocument = () => {
    setSavingDoc(true);
    // Chained, not try / finally, which React Compiler cannot compile.
    createDoc({ sessionId })
      .then((docId: Id<"docs">) => router.push({ pathname: "/doc/[docId]", params: { docId, repo: chat.repoId } }))
      .catch(() => toast.error("Couldn't save document"))
      .then(() => setSavingDoc(false));
  };

  return (messageId) => {
    const plan = proposedPlanForMessage(plans, messageId);
    if (!plan) return null;
    const implemented = plan.implementedAt !== undefined;
    return (
      <ProposedPlanCard
        key={plan._id}
        planMarkdown={plan.planMarkdown}
        implemented={implemented}
        onImplement={canAct && !implemented ? () => implement(plan) : undefined}
        onImplementInNewSession={canAct && !implemented ? () => implementInNewSession(plan) : undefined}
        onSaveAsDocument={canAct ? saveAsDocument : undefined}
        saveAsDocumentLabel={linkedDoc ? "Update Document" : "Save as Document"}
        savingDoc={savingDoc}
      />
    );
  };
}

/**
 * The web `ProposedPlanCard`: a "Plan" (or "Implemented") badge, the plan's
 * title and a Copy button; the plan, folded to a preview with Expand plan when
 * long; then Save as Document, Implement (green) and Implement in new
 * session. Not here from the web: Edit (the web markdown editor) and Download
 * (Copy covers taking it elsewhere on a phone).
 */
function ProposedPlanCard({
  planMarkdown,
  implemented,
  onImplement,
  onImplementInNewSession,
  onSaveAsDocument,
  saveAsDocumentLabel,
  savingDoc,
}: {
  planMarkdown: string;
  implemented: boolean;
  onImplement?: () => void;
  onImplementInNewSession?: () => void;
  onSaveAsDocument?: () => void;
  saveAsDocumentLabel: string;
  savingDoc: boolean;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  // The web `text-success-foreground`, which the phone theme does not carry.
  const onSuccess = palette.successForeground[scheme === "light" ? "light" : "dark"];
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const title = proposedPlanTitle(planMarkdown) ?? "Proposed plan";
  const canFold = planMarkdown.length > FOLD_CHARS || planMarkdown.split("\n").length > FOLD_LINES;
  const folded = canFold && !expanded;
  const body = folded ? buildCollapsedProposedPlanPreviewMarkdown(planMarkdown, { maxLines: 10 }) : stripDisplayedPlanMarkdown(planMarkdown);

  const copy = () => {
    Clipboard.setStringAsync(normalizePlanMarkdownForExport(planMarkdown)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast.error("Couldn't copy the plan"),
    );
  };

  return (
    <View className="gap-3 rounded-xl border p-4" style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <View className="flex-row items-center gap-2">
        <Badge variant="secondary">{implemented ? "IMPLEMENTED" : "PLAN"}</Badge>
        <Text numberOfLines={1} className="font-instrument-sans-medium min-w-0 flex-1 text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copied ? "Copied" : "Copy plan"}
          onPress={copy}
          hitSlop={4}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
        >
          {copied ? <IconCheck size={16} color={theme.success} /> : <IconCopy size={16} color={theme.mutedForeground} />}
        </Pressable>
      </View>
      <Markdown>{body}</Markdown>
      {canFold ? (
        <Button size="sm" fullWidth={false} variant="outline" className="self-center" onPress={() => setExpanded(!expanded)}>
          {expanded ? "Collapse plan" : "Expand plan"}
        </Button>
      ) : null}
      {onSaveAsDocument || onImplement || onImplementInNewSession ? (
        <View className="flex-row flex-wrap gap-2">
          {onSaveAsDocument ? (
            <Button
              size="sm"
              fullWidth={false}
              variant="secondary"
              loading={savingDoc}
              disabled={savingDoc}
              leftIcon={<IconFileExport size={14} color={theme.secondaryForeground} />}
              onPress={onSaveAsDocument}
            >
              {saveAsDocumentLabel}
            </Button>
          ) : null}
          {onImplement ? (
            // The web `bg-success text-success-foreground` button.
            <Button size="sm" fullWidth={false} leftIcon={<IconCode size={14} color={onSuccess} />} style={{ backgroundColor: theme.success, borderColor: theme.success }} onPress={onImplement}>
              <Text className="font-instrument-sans-medium text-sm" style={{ color: onSuccess, fontWeight: "500" }}>
                Implement
              </Text>
            </Button>
          ) : null}
          {onImplementInNewSession ? (
            <Button size="sm" fullWidth={false} variant="secondary" onPress={onImplementInNewSession}>
              Implement in new session
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

import { api, normalizeAIModel, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  buildCollapsedProposedPlanPreviewMarkdown,
  buildProposedPlanMarkdownFilename,
  buildPlanImplementationPrompt,
  buildPlanImplementationThreadTitle,
  normalizePlanMarkdownForExport,
  proposedPlanForMessage,
  proposedPlanTitle,
  stripDisplayedPlanMarkdown,
  type ProposedPlanRow,
} from "@eva/shared/proposedPlan";
import { IconCheck, IconCode, IconCopy, IconDownload, IconFileExport, IconPencil, type IconProps } from "@tabler/icons-react-native";
import {
  Badge,
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from "@vvedantb/native-ui/primitives";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { palette } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { useRef, useState, type ComponentType, type ReactNode } from "react";
import { Pressable, Text, View, type TextInput } from "react-native";
import type { Chat } from "@/chat/useChatModelPick";
import { useScheme } from "@/ui/theme";

const FOLD_CHARS = 900;
const FOLD_LINES = 20;

/**
 * The web session chat's proposed plans (`ProposedPlanCard` after the message
 * that proposed each one): `planAfter(messageId)` is the card under that
 * message, or null. Only a session chat has plans, as on the web. Implement
 * sends the web prompt in this chat and marks the plan implemented;
 * Implement in new session starts one on this chat's model and account with
 * the plan as its plan, as the web; Save as Document saves the session's
 * plan as a doc and opens it; Edit saves the edited plan as the session's
 * plan (`sessions.updatePlanContent`), as the web. The web shows that saved
 * plan in its Plan tab; the phone has none, so once the session's plan
 * (`planContent`) matches no card, the newest card shows it, and its Copy,
 * Download, Edit and Implement use it. A closed chat shows the card without
 * actions.
 */
export function useProposedPlans(chat: Chat | null | undefined, planContent: string | undefined): (messageId: string) => ReactNode {
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
  const [savingPlan, setSavingPlan] = useState(false);

  if (!chat || !sessionId || !plans || plans.length === 0) return () => null;
  const canAct = chat.canReply;
  const saved = planContent?.trim() ?? "";
  const edited = saved !== "" && !plans.some((plan) => plan.planMarkdown.trim() === saved) ? planContent : undefined;
  const newest = plans.reduce((latest, plan) => (plan.createdAt > latest.createdAt ? plan : latest));
  const markdownOf = (plan: ProposedPlanRow) => (edited !== undefined && plan._id === newest._id ? edited : plan.planMarkdown);

  const implement = (plan: ProposedPlanRow) => {
    send({ target: chat.target, message: buildPlanImplementationPrompt(markdownOf(plan)) })
      .then(() => markImplemented({ planId: plan._id }))
      .catch(() => toast.error("Couldn't send your message"));
  };

  const implementInNewSession = (plan: ProposedPlanRow) => {
    start({
      repoId: chat.repoId,
      prompt: buildPlanImplementationPrompt(markdownOf(plan)),
      title: buildPlanImplementationThreadTitle(markdownOf(plan)),
      model: normalizeAIModel(chat.model),
      providerAccountId: chat.providerAccountId ?? null,
    })
      .then(async ({ sessionId: next }) => {
        await updatePlanContent({ id: next, planContent: markdownOf(plan) });
        await markImplemented({ planId: plan._id, implementationSessionId: next });
        router.push({ pathname: "/chat/[target]", params: { target: next } });
      })
      .catch((cause: Error) => toast.error(cause.message || "Couldn't start new session"));
  };

  const savePlan = async (markdown: string) => {
    setSavingPlan(true);
    const saved = await updatePlanContent({ id: sessionId, planContent: markdown }).then(
      () => true,
      () => false,
    );
    setSavingPlan(false);
    if (saved) toast.success("Plan saved", { id: "session-plan-save" });
    else toast.error("Couldn't save plan", { id: "session-plan-save" });
    return saved;
  };

  const saveAsDocument = () => {
    setSavingDoc(true);
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
        planMarkdown={markdownOf(plan)}
        implemented={implemented}
        onImplement={canAct && !implemented ? () => implement(plan) : undefined}
        onImplementInNewSession={canAct && !implemented ? () => implementInNewSession(plan) : undefined}
        onSave={canAct ? savePlan : undefined}
        savingPlan={savingPlan}
        onSaveAsDocument={canAct ? saveAsDocument : undefined}
        saveAsDocumentLabel={linkedDoc ? "Update Document" : "Save as Document"}
        savingDoc={savingDoc}
      />
    );
  };
}

function ProposedPlanCard({
  planMarkdown,
  implemented,
  onImplement,
  onImplementInNewSession,
  onSave,
  savingPlan,
  onSaveAsDocument,
  saveAsDocumentLabel,
  savingDoc,
}: {
  planMarkdown: string;
  implemented: boolean;
  onImplement?: () => void;
  onImplementInNewSession?: () => void;
  onSave?: (markdown: string) => Promise<boolean>;
  savingPlan: boolean;
  onSaveAsDocument?: () => void;
  saveAsDocumentLabel: string;
  savingDoc: boolean;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const onSuccess = palette.successForeground[scheme === "light" ? "light" : "dark"];
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
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

  const download = () => {
    sharePlanFile(planMarkdown).catch(() => toast.error("Couldn't share the plan"));
  };

  return (
    <View className="gap-3 rounded-xl border p-4" style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <View className="flex-row items-center gap-2">
        <Badge variant="secondary">{implemented ? "IMPLEMENTED" : "PLAN"}</Badge>
        <Text numberOfLines={1} className="font-instrument-sans-medium min-w-0 flex-1 text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
          {title}
        </Text>
        <View className="flex-row">
          <PlanIconButton
            label={copied ? "Copied" : "Copy plan"}
            icon={copied ? IconCheck : IconCopy}
            color={copied ? theme.success : theme.mutedForeground}
            onPress={copy}
          />
          <PlanIconButton label="Download plan as markdown" icon={IconDownload} color={theme.mutedForeground} onPress={download} />
        </View>
      </View>
      <Markdown>{body}</Markdown>
      {canFold ? (
        <Button size="sm" fullWidth={false} variant="outline" className="self-center" onPress={() => setExpanded(!expanded)}>
          {expanded ? "Collapse plan" : "Expand plan"}
        </Button>
      ) : null}
      {onSave || onSaveAsDocument || onImplement || onImplementInNewSession ? (
        <View className="flex-row flex-wrap gap-2">
          {onSave ? (
            <Button
              size="sm"
              fullWidth={false}
              variant="secondary"
              leftIcon={<IconPencil size={14} color={theme.secondaryForeground} />}
              onPress={() => setEditing(true)}
            >
              Edit
            </Button>
          ) : null}
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
      {onSave ? (
        <PlanEditSheet open={editing} onOpenChange={setEditing} planMarkdown={planMarkdown} saving={savingPlan} onSave={onSave} />
      ) : null}
    </View>
  );
}

function PlanIconButton({
  label,
  icon: Icon,
  color,
  onPress,
}: {
  label: string;
  icon: ComponentType<IconProps>;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
    >
      <Icon size={16} color={color} />
    </Pressable>
  );
}

async function sharePlanFile(planMarkdown: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available");
  const file = new File(Paths.cache, buildProposedPlanMarkdownFilename(planMarkdown));
  file.create({ overwrite: true });
  file.write(normalizePlanMarkdownForExport(planMarkdown));
  await Sharing.shareAsync(file.uri, { mimeType: "text/markdown", UTI: "net.daringfireball.markdown", dialogTitle: file.name });
}

function PlanEditSheet({
  open,
  onOpenChange,
  planMarkdown,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planMarkdown: string;
  saving: boolean;
  onSave: (markdown: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(planMarkdown);
  const field = useRef<TextInput>(null);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        onOpenChange(next);
      }}
    >
      <SheetContent
        className="gap-3 px-4"
        onShow={() => {
          setDraft(planMarkdown);
          field.current?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>Edit plan</SheetTitle>
        </SheetHeader>
        <SheetBody contentContainerClassName="gap-3">
          <Textarea
            ref={field}
            accessibilityLabel="Plan markdown"
            value={draft}
            onChangeText={setDraft}
            autoCapitalize="sentences"
            className="min-h-80"
          />
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" disabled={saving} onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={saving}
            onPress={() => {
              void onSave(draft).then((saved) => {
                if (saved) onOpenChange(false);
              });
            }}
          >
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

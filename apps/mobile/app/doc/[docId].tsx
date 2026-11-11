import { api } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconCopy, IconDots, IconExternalLink, IconFileText } from "@tabler/icons-react-native";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { CenteredSpinner, EmptyState, SheetRow } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useQuery } from "convex/react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { displayTitle, timeAgo } from "@/ui/format";
import { MenuSheet } from "@/ui/MenuSheet";
import { copyText } from "@/ui/copyText";
import { useScheme, XS_TRACKING } from "@/ui/theme";

/**
 * One document, as the web doc page (`DocPrdViewer`) read on a phone: the
 * "Documents" header (back, and the web "Options" menu as a sheet: Copy PRD,
 * and View Tests PR once the tests PR exists), the title and its age as the
 * web toolbar, then the Markdown tab's content as read-only Markdown. A PR
 * recap opens in Reviews, as the web redirects it. Not here from the web:
 * editing (title, body, the Editing / Suggesting / Viewing modes), the HTML
 * tab, comments, suggestions, version and interview history, Interview Me,
 * Generate Tests, presence and the "Processing PRD..." progress.
 */
export default function DocScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ docId: string; repo?: string }>();
  const insets = useSafeAreaInsets();
  const theme = EVA_THEME[useScheme()];
  const leave = () => goBackOrReplace(router, "/projects?section=docs");
  // Route params are strings: the repo and the doc resolve through the lists
  // that hold them, so their ids keep their table types.
  const repos = useQuery(api.githubRepos.list, {});
  const repo = repos?.find((candidate) => candidate._id === params.repo);
  const docs = useQuery(api.docs.list, repo ? { repoId: repo._id } : "skip");
  const listed = docs?.find((candidate) => candidate._id === params.docId);
  const doc = useQuery(api.docs.get, listed ? { id: listed._id } : "skip");

  const loading = repos === undefined || (repo !== undefined && (docs === undefined || (listed !== undefined && doc === undefined)));
  if (loading || !repo || !doc) {
    return (
      <Screen onBack={leave}>
        {loading ? (
          <CenteredSpinner label="Loading document" />
        ) : (
          // The web `EntityNotFound` for a document.
          <EmptyState icon={IconFileText} title="Document not found" description="It was deleted, or you no longer have access." />
        )}
      </Screen>
    );
  }
  // PR recaps moved to Reviews — keep old links working (the web redirect).
  if (doc.kind === "pr-recap" && doc.prNumber !== undefined) {
    return <Redirect href={{ pathname: "/review/[repoId]/[prNumber]", params: { repoId: repo._id, prNumber: String(doc.prNumber) } }} />;
  }

  const testsPrUrl = doc.testGenStatus === "completed" ? doc.testPrUrl : undefined;
  return (
    <Screen onBack={leave} headerRight={<DocOptions content={doc.content} testsPrUrl={testsPrUrl} />}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}>
        {/* The web toolbar: the `text-lg` semibold title, then its age (`RelativeDateTime`). */}
        <View className="flex-row items-start gap-3">
          <Text
            accessibilityRole="header"
            className="font-instrument-sans-semibold min-w-0 flex-1 text-lg"
            style={{ fontWeight: "600", color: theme.foreground }}
          >
            {displayTitle(doc.title)}
          </Text>
          <Text
            className="font-instrument-sans pt-1.5 text-xs"
            style={{ color: theme.mutedForeground, letterSpacing: XS_TRACKING, fontVariant: ["tabular-nums"] }}
          >
            {timeAgo(doc.updatedAt)}
          </Text>
        </View>
        <View className="mt-4">
          {doc.content.trim() ? (
            <Markdown onCopyCode={copyText} onCopyTable={copyText}>
              {doc.content}
            </Markdown>
          ) : (
            // The web Drafts card's empty copy.
            <Text className="font-instrument-sans text-sm italic" style={{ color: theme.mutedForeground }}>
              No content
            </Text>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

/** The stack header (back, "Documents", an optional end button) over the screen body. */
function Screen({ onBack, headerRight, children }: { onBack: () => void; headerRight?: ReactNode; children: ReactNode }) {
  return (
    <View className="flex-1">
      <StackPageHeader title="Documents" onBack={onBack} headerRight={headerRight} />
      {children}
    </View>
  );
}

/**
 * The web "Options" button (icon only below `sm`) as the header "…", and
 * its menu items a phone can use as a sheet: Copy PRD, and View Tests PR
 * once test generation has made one.
 */
function DocOptions({ content, testsPrUrl }: { content: string; testsPrUrl: string | undefined }) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Document options"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        className="h-11 w-11 items-center justify-center rounded-lg active:opacity-70"
      >
        <IconDots size={16} color={muted} />
      </Pressable>
      <MenuSheet open={open} onOpenChange={setOpen} title="Options">
        <SheetRow
          icon={IconCopy}
          title="Copy PRD"
          onPress={() => {
            setOpen(false);
            void copyText(content).then(() => toast.success("Copied"));
          }}
        />
        {testsPrUrl ? (
          <SheetRow
            icon={IconExternalLink}
            title="View Tests PR"
            onPress={() => {
              setOpen(false);
              void Linking.openURL(testsPrUrl);
            }}
          />
        ) : null}
      </MenuSheet>
    </>
  );
}

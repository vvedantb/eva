import { api } from "@eva/backend";
import { IconTerminal2 } from "@tabler/icons-react-native";
import { PageHeader, ScreenContainer } from "@vvedantb/native-ui/layout";
import { CenteredSpinner, EmptyState, ListRow } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { RowStatus } from "@/ui/RowStatus";
import { RowTime } from "@/ui/RowTime";
import { TabScreen } from "@/ui/TabScreen";

/** Recent open sessions across every repo the user can access (api.mobile.listChats). */
export default function SessionsScreen() {
  const sessions = useQuery(api.mobile.listChats, {});
  const router = useRouter();

  return (
    <TabScreen>
      <PageHeader title="Sessions" />
      {sessions === undefined ? (
        <CenteredSpinner label="Loading sessions" />
      ) : sessions.length === 0 ? (
        <EmptyState icon={IconTerminal2} title="No sessions" description="Start a session on the web. It shows up here." />
      ) : (
        <ScreenContainer reserveTabBar>
          {sessions.map((session) => (
            <ListRow
              key={session.sessionId}
              title={session.title}
              meta={session.repoLabel}
              titleEnd={<RowTime at={session.updatedAt} />}
              // The question mark wins over the status dot, as on the web sidebar.
              leading={
                <RowStatus awaitingAnswer={session.isAwaitingAnswer} tone={session.status === "active" ? "active" : "neutral"} />
              }
              onPress={() => router.push({ pathname: "/chat/[target]", params: { target: session.sessionId } })}
            />
          ))}
        </ScreenContainer>
      )}
    </TabScreen>
  );
}

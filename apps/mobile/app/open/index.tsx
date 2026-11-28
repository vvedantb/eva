import { api } from "@eva/backend";
import { parseAppHref } from "@eva/shared/appHref";
import { IconExternalLink, IconLinkOff } from "@tabler/icons-react-native";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import { Button, CenteredSpinner, EmptyState } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Linking, View } from "react-native";
import { WEB_URL } from "@/config";

/**
 * Opens a web link inside a repo on its phone screen (`openAppLink`): a task,
 * a project, a session's chat or a doc, looked up by its per-repo number, as
 * the web route does. It replaces itself with that screen, so Back returns to
 * where the link was tapped. An item that is gone (or not yours) says so, with
 * the web as a way out. Routes as `/open?href=<path>&repo=<repoId>`.
 */
export default function OpenLinkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ href: string; repo?: string }>();
  const href = params.href ?? "";
  const target = parseAppHref(href);
  const repos = useQuery(api.githubRepos.list, {});
  const repo = repos?.find((candidate) => candidate._id === params.repo);
  const args = (kind: string) => (repo && target?.kind === kind && "numId" in target ? { repoId: repo._id, numId: target.numId } : "skip");
  const task = useQuery(api.agentTasks.getByNumId, args("task"));
  const project = useQuery(api.projects.getByNumId, args("project"));
  const session = useQuery(api.sessions.getByNumId, args("session"));
  const doc = useQuery(api.docs.getByNumId, args("doc"));

  if (repo && task) return <Redirect href={{ pathname: "/quick-task/[taskId]", params: { taskId: task._id, repo: repo._id, numId: task.numId } }} />;
  if (repo && project) return <Redirect href={{ pathname: "/project/[projectId]", params: { projectId: project._id, repo: repo._id } }} />;
  if (session) return <Redirect href={{ pathname: "/chat/[target]", params: { target: session._id } }} />;
  if (repo && doc) return <Redirect href={{ pathname: "/doc/[docId]", params: { docId: doc._id, repo: repo._id } }} />;

  const looked =
    target?.kind === "task" ? task : target?.kind === "project" ? project : target?.kind === "session" ? session : target?.kind === "doc" ? doc : null;
  const loading = repos === undefined || (repo !== undefined && target !== null && looked === undefined);
  return (
    <View className="flex-1">
      <StackPageHeader title="Open" onBack={() => goBackOrReplace(router, "/")} />
      {loading ? (
        <CenteredSpinner label="Opening" />
      ) : (
        <View className="flex-1 justify-center gap-4 px-6">
          <EmptyState icon={IconLinkOff} title="Not found" description="It was deleted, or you no longer have access." />
          {href ? (
            <Button variant="outline" leftIcon={<IconExternalLink size={16} />} onPress={() => void Linking.openURL(`${WEB_URL}${href}`)}>
              Open on the web
            </Button>
          ) : null}
        </View>
      )}
    </View>
  );
}

import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
import { branchParser } from "@/lib/search-params";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useDocByNumId } from "@/lib/useResolveByNumId";
import { EntityNumIdGate } from "@/lib/components/EntityNumIdGate";
import type { FunctionReturnType } from "convex/server";
import {
  Button,
  Tabs,
  TabsList,
  TabsTransition,
  TabsTrigger,
} from "@vvedantb/ui";
import { IconPlayerPlay } from "@tabler/icons-react";
import { BranchSelect } from "@/lib/components/BranchSelect";
import { CodeTestingContent } from "../_components/CodeTestingContent";
import { BrowserTestingContent } from "../_components/BrowserTestingContent";

export const Route = createFileRoute(
  "/_repo/$owner/$repo/testing-arena/$numId/$arenaTab",
)({
  component: TestingArenaDetailRoute,
});

const ARENA_TABS = ["code", "browser"] as const;
type ArenaTab = (typeof ARENA_TABS)[number];

function toArenaTab(value: string): ArenaTab {
  return value === "browser" ? "browser" : "code";
}

type ArenaDoc = NonNullable<FunctionReturnType<typeof api.docs.getByNumId>>;

function TestingArenaDetailRoute() {
  const { numId, arenaTab } = Route.useParams();
  const { basePath, repoId } = useRepo();
  const resolve = useDocByNumId(numId, repoId);

  return (
    <EntityNumIdGate
      resolve={resolve}
      entityLabel="document"
      backTo={`${basePath}/testing-arena`}
    >
      {(doc) => <TestingArenaDetail doc={doc} tab={toArenaTab(arenaTab)} />}
    </EntityNumIdGate>
  );
}

function TestingArenaDetail({ doc, tab }: { doc: ArenaDoc; tab: ArenaTab }) {
  const { repo } = useRepo();
  const navigate = useNavigate();
  const { owner, repo: repoParam, numId } = Route.useParams();
  const reports = useQuery(api.evaluationReports.listByDoc, {
    docId: doc._id,
  });
  const scenarios = useQuery(api.arenaScenarios.listByDoc, {
    docId: doc._id,
  });
  const codeReports = reports?.filter((r) => (r.kind ?? "code") === "code");
  const browserReports = reports?.filter((r) => r.kind === "browser");
  const tabReports = tab === "code" ? codeReports : browserReports;

  const activeReport = tabReports?.find(
    (r) => r.status === "running" || r.fixStatus === "fixing",
  );
  const streaming = useQuery(
    api.streaming.get,
    activeReport ? { entityId: activeReport._id } : "skip",
  );
  const startEvaluation = useMutation(api.evaluationWorkflow.startEvaluation);
  const startBrowserRun = useMutation(api.arenaBrowserWorkflow.startManualRun);
  const [isStarting, setIsStarting] = useState(false);
  const [branch, setBranch] = useQueryState("branch", branchParser);

  const hasActiveRun =
    tabReports?.some(
      (r) =>
        r.trigger === undefined &&
        (r.status === "pending" || r.status === "running"),
    ) ?? false;
  const hasContent = (doc.content?.trim().length ?? 0) > 0;
  const hasScenarios = (scenarios?.length ?? 0) > 0;
  const canRun = tab === "code" ? hasContent : hasScenarios;
  const disabledReason =
    tab === "code"
      ? "Add content to this document to run tests"
      : "Add a browser scenario to run tests";

  const handleRunTest = async () => {
    setIsStarting(true);
    const args = {
      docId: doc._id,
      repoId: repo._id,
      branchName: branch !== "main" ? branch : undefined,
    };
    const start = tab === "code" ? startEvaluation : startBrowserRun;
    try {
      await start(args);
    } catch (error) {
      setIsStarting(false);
      throw error;
    }
    setIsStarting(false);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="min-w-0 truncate text-sm font-medium">{doc.title}</h1>
          <Tabs
            value={tab}
            onValueChange={(value) =>
              navigate({
                to: "/$owner/$repo/testing-arena/$numId/$arenaTab",
                params: {
                  owner,
                  repo: repoParam,
                  numId,
                  arenaTab: toArenaTab(value),
                },
                search: (prev) => prev,
              })
            }
          >
            <TabsList
              size="sm"
              className="tabs-segmented"
              aria-label="Test type"
            >
              <TabsTrigger value="code">Code</TabsTrigger>
              <TabsTrigger value="browser">Browser</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-2">
          <BranchSelect
            value={branch}
            onValueChange={setBranch}
            className="h-7 w-24 text-xs max-sm:h-10 max-sm:w-32 max-sm:shrink-0 sm:w-36"
          />
          <Button
            size="sm"
            onClick={handleRunTest}
            disabled={isStarting || hasActiveRun || !canRun}
            title={!canRun ? disabledReason : undefined}
          >
            <IconPlayerPlay size={16} />
            {isStarting || hasActiveRun ? "Running..." : "Run Test"}
          </Button>
        </div>
      </div>
      <TabsTransition
        value={tab}
        order={ARENA_TABS}
        className="flex-1 min-h-0 overflow-hidden"
        panelClassName="h-full"
      >
        {tab === "code" ? (
          <CodeTestingContent
            reports={codeReports}
            streamingActivity={streaming?.currentActivity}
          />
        ) : (
          <BrowserTestingContent
            doc={doc}
            scenarios={scenarios}
            reports={browserReports}
            streamingActivity={streaming?.currentActivity}
          />
        )}
      </TabsTransition>
    </div>
  );
}

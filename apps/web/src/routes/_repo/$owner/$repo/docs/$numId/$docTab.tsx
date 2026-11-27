import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";
import {
  DOC_VIEWER_DEFAULT_TAB,
  isDocViewerTab,
  type DocViewerTab,
} from "@/lib/search-params";
import { DocViewer } from "@/lib/components/docs/DocViewer";
import { EntityNumIdGate } from "@/lib/components/EntityNumIdGate";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useDocByNumId } from "@/lib/useResolveByNumId";

export const Route = createFileRoute("/_repo/$owner/$repo/docs/$numId/$docTab")(
  {
    beforeLoad: ({ params }) => {
      if (!isDocViewerTab(params.docTab)) {
        throw redirect({
          to: "/$owner/$repo/docs/$numId/$docTab",
          params: {
            owner: params.owner,
            repo: params.repo,
            numId: params.numId,
            docTab: DOC_VIEWER_DEFAULT_TAB,
          },
          search: (prev) => prev,
        });
      }
    },
    component: DocDetailTabPage,
  },
);

function DocDetailTabPage() {
  const { owner, repo, numId, docTab } = Route.useParams();
  const { basePath, repoId } = useRepo();
  const resolve = useDocByNumId(numId, repoId);
  const tab: DocViewerTab = isDocViewerTab(docTab)
    ? docTab
    : DOC_VIEWER_DEFAULT_TAB;

  return (
    <EntityNumIdGate
      resolve={resolve}
      entityLabel="document"
      backTo={`${basePath}/docs`}
    >
      {(doc) =>
        // PR recaps moved to Reviews — keep old /docs/$numId links working.
        doc.kind === "pr-recap" && doc.prNumber !== undefined ? (
          <Navigate
            to="/$owner/$repo/reviews/$prNumber/$reviewTab"
            params={{
              owner,
              repo,
              prNumber: String(doc.prNumber),
              reviewTab: "recap",
            }}
            search={(prev) => prev}
            replace
          />
        ) : (
          <DocViewer doc={doc} activeTab={tab} />
        )
      }
    </EntityNumIdGate>
  );
}

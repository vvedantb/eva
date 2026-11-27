"use client";

import type { FunctionReturnType } from "convex/server";
import { type api } from "@eva/backend";
import type { DocViewerTab } from "@/lib/search-params";
import { useEntityDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { DocPrdViewer } from "./_components/DocPrdViewer";
import { DocRecapViewer } from "./_components/DocRecapViewer";

type Doc = NonNullable<FunctionReturnType<typeof api.docs.get>>;

export function DocViewer({
  doc,
  activeTab,
}: {
  doc: Doc;
  activeTab: DocViewerTab;
}) {
  // Both branches below are a doc detail view, so the tab title is named once
  // here rather than in each viewer.
  useEntityDocumentTitle(doc.title);

  if (doc.kind === "pr-recap") {
    return <DocRecapViewer key={doc._id} doc={doc} activeTab={activeTab} />;
  }

  return <DocPrdViewer key={doc._id} doc={doc} activeTab={activeTab} />;
}

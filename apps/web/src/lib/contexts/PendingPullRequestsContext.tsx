"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import {
  addPullRequestContext,
  type PullRequestContext,
} from "@/lib/components/chat/pullRequestContext";

interface PendingPullRequestsValue {
  readonly items: ReadonlyArray<PullRequestContext>;
  /** No-op when a chip for the same URL is already attached. */
  add: (pr: PullRequestContext) => void;
  remove: (url: string) => void;
}

const PendingPullRequestsContext =
  createContext<PendingPullRequestsValue | null>(null);

/** Pull requests dropped on the composer, appended to the next prompt. */
export function PendingPullRequestsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [items, setItems] = useState<ReadonlyArray<PullRequestContext>>([]);

  const value: PendingPullRequestsValue = {
    items,
    add: (pr) => {
      setItems((current) => addPullRequestContext(current, pr));
    },
    remove: (url) => {
      setItems((current) => current.filter((item) => item.url !== url));
    },
  };

  return (
    <PendingPullRequestsContext value={value}>
      {children}
    </PendingPullRequestsContext>
  );
}

export function usePendingPullRequests(): PendingPullRequestsValue | undefined {
  return useContext(PendingPullRequestsContext) ?? undefined;
}

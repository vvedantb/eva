"use client";

import { PageWrapper } from "@/lib/components/PageWrapper";
import { SettingsStack } from "@vvedantb/ui";

interface SettingsPageProps {
  title: React.ReactNode;
  /** Sparse primary action(s) in the title row (e.g. Add, Delete). */
  headerRight?: React.ReactNode;
  /** Filters / search / segmented controls — sits under the title. */
  toolbar?: React.ReactNode;
  /** Route tabs — sits under the title (and under toolbar if both exist). */
  tabs?: React.ReactNode;
  /**
   * Wrap children in the standard settings section stack. Set false when the
   * child already owns its own vertical rhythm (e.g. EnvVarsTable).
   */
  stack?: boolean;
  children: React.ReactNode;
}

/**
 * Shared chrome for global + repo settings: comfortable reading width,
 * title row, optional refine toolbar / tabs, then a consistent section stack.
 */
export function SettingsPage({
  title,
  headerRight,
  toolbar,
  tabs,
  stack = true,
  children,
}: SettingsPageProps) {
  return (
    <PageWrapper
      title={title}
      comfortable
      insetHeader
      headerRight={headerRight}
      toolbar={toolbar}
      tabs={tabs}
    >
      {stack ? <SettingsStack>{children}</SettingsStack> : children}
    </PageWrapper>
  );
}

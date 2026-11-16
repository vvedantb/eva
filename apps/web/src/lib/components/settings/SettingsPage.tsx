"use client";

import {
  SettingsPage as KitSettingsPage,
  type SettingsPageProps as KitSettingsPageProps,
} from "@vvedantb/ui";
import { PageWrapper } from "@/lib/components/PageWrapper";

type SettingsPageProps = Omit<KitSettingsPageProps, "layout">;

/**
 * Shared chrome for global + repo settings: comfortable reading width,
 * title row, optional refine toolbar / tabs, then a consistent section stack.
 * Wraps the app-kit page with eva's `PageWrapper`.
 */
export function SettingsPage(props: SettingsPageProps) {
  return (
    <KitSettingsPage
      {...props}
      layout={({ title, headerRight, toolbar, tabs, fillHeight, children }) => (
        <PageWrapper
          title={title}
          comfortable
          insetHeader
          headerRight={headerRight}
          toolbar={toolbar}
          tabs={tabs}
          fillHeight={fillHeight}
        >
          {children}
        </PageWrapper>
      )}
    />
  );
}

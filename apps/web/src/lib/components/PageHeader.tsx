"use client";

import { PageHeaderBar } from "@vvedantb/ui";

export interface PageHeaderProps {
  title?: React.ReactNode;
  titleAfter?: React.ReactNode;
  headerCenter?: React.ReactNode;
  headerRight?: React.ReactNode;
  toolbar?: React.ReactNode;
  tabs?: React.ReactNode;
  insetHeader?: boolean;
  showBack?: boolean;
  onBack?: () => void;
  comfortable?: boolean;
}

/**
 * eva's page title row. A thin adapter over `@vvedantb/ui`'s `PageHeaderBar`
 * that fixes eva's layout (inline title, a centred middle column at `md`, entry
 * animations). The shared component carries the markup; this keeps eva's prop
 * surface and import path unchanged.
 */
export function PageHeader(props: PageHeaderProps) {
  return (
    <PageHeaderBar
      {...props}
      animated
      titleLayout="inline"
      headerColumns="three-at-md"
    />
  );
}

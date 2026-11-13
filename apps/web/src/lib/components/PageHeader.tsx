"use client";

import { PageHeaderBar } from "@vvedantb/ui";

export interface PageHeaderProps {
  title?: React.ReactNode;
  /**
   * Sits beside the title, before `headerRight`. For navigation that belongs
   * with "where am I" rather than the action cluster — e.g. the main/sandbox
   * surface switcher. Centred over the title row at `sm` and up; below that it
   * takes its own row under the title.
   */
  titleAfter?: React.ReactNode;
  headerCenter?: React.ReactNode;
  headerRight?: React.ReactNode;
  /**
   * Secondary refine row under the title (filters, search, segmented controls).
   * Kept out of `headerRight` so the title row stays quiet.
   */
  toolbar?: React.ReactNode;
  /** Route / view tabs under the title (and under toolbar when both exist). */
  tabs?: React.ReactNode;
  /**
   * Indent the title row by the card gutter (`px-4`) so the page title lines up
   * with the section titles inside the cards below, rather than with the card
   * edge. For settings-shaped pages; leave off for list pages whose card has no
   * section heading to align to.
   */
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

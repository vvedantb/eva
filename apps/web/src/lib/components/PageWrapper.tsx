"use client";

import { PageWrapper as SharedPageWrapper } from "@vvedantb/ui";
import { type PageHeaderProps } from "@/lib/components/PageHeader";
import { usePageTitleSync } from "@/lib/contexts/PageTitleContext";

interface PageWrapperProps extends PageHeaderProps {
  fillHeight?: boolean;
  children: React.ReactNode;
  childPadding?: boolean;
}

/**
 * eva's full-height page. A thin adapter over `@vvedantb/ui`'s `PageWrapper`
 * that fixes eva's layout (inline title, a centred middle column at `md`, entry
 * animations, the themed scrollbar on the body) and mirrors the title into
 * eva's page-title context. Keeps eva's prop surface and import path unchanged.
 */
export function PageWrapper({ children, ...props }: PageWrapperProps) {
  usePageTitleSync(props.title);

  return (
    <SharedPageWrapper
      {...props}
      animated
      titleLayout="inline"
      headerColumns="three-at-md"
      bodyScrollbar
    >
      {children}
    </SharedPageWrapper>
  );
}

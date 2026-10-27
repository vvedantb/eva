"use client";

import { createPageTitleContext } from "@vvedantb/ui";

/**
 * The page title for the mobile top bar (which renders it in place of the
 * logo). `PageWrapper` publishes it for ordinary pages; views that lay out
 * their own header call `usePageTitleSync` directly.
 */
export const { PageTitleProvider, usePageTitle, usePageTitleSync } =
  createPageTitleContext({
    missingProviderMessage:
      "usePageTitle must be used within a PageTitleProvider",
  });

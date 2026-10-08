"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface PageTitleContextType {
  pageTitle: string;
  setPageTitle: (title: string) => void;
}

const PageTitleContext = createContext<PageTitleContextType | undefined>(
  undefined,
);

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [pageTitle, setPageTitleState] = useState("");

  const setPageTitle = (title: string) => {
    setPageTitleState(title);
  };

  return (
    <PageTitleContext.Provider value={{ pageTitle, setPageTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle() {
  const context = useContext(PageTitleContext);
  if (context === undefined) {
    throw new Error("usePageTitle must be used within a PageTitleProvider");
  }
  return context;
}

/**
 * Publishes the page title to the mobile top bar (which renders it in place of
 * the logo) while the caller is mounted. `PageWrapper` does this for ordinary
 * pages; views that lay out their own header call it directly.
 */
export function usePageTitleSync(title: React.ReactNode) {
  const { setPageTitle } = usePageTitle();
  const isStringTitle = typeof title === "string";

  useEffect(() => {
    setPageTitle(isStringTitle ? title : "");
    return () => setPageTitle("");
  }, [title, isStringTitle, setPageTitle]);
}

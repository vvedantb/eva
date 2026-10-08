"use client";

import { PageHeader, type PageHeaderProps } from "@/lib/components/PageHeader";
import { usePageTitleSync } from "@/lib/contexts/PageTitleContext";

interface PageWrapperProps extends PageHeaderProps {
  fillHeight?: boolean;
  children: React.ReactNode;
  childPadding?: boolean;
}

export function PageWrapper({
  fillHeight = false,
  children,
  childPadding = true,
  ...header
}: PageWrapperProps) {
  const { title, comfortable = false } = header;
  usePageTitleSync(title);

  return (
    <div className="flex-1 h-full min-h-0 overflow-hidden animate-in fade-in duration-300">
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <PageHeader {...header} />
        <div
          className={`flex-1 min-h-0 ${fillHeight ? "overflow-hidden flex flex-col" : "overflow-auto scrollbar"}`}
        >
          <div
            className={`flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-1 duration-300 ${childPadding ? (comfortable ? "p-4 pt-0 sm:px-6" : "p-3 pt-0 sm:px-4") : ""} ${fillHeight ? "flex-1 min-h-0 overflow-hidden" : "min-h-full"}`}
          >
            {comfortable ? (
              <div
                className={`mx-auto w-full max-w-5xl ${fillHeight ? "flex min-h-0 flex-1 flex-col" : ""}`}
              >
                {children}
              </div>
            ) : (
              children
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useQueryStates } from "nuqs";
import { designVariationParser, viewModeParser } from "@/lib/search-params";
import {
  Button,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  motionBase,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import {
  IconCheck,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconPalette,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { PreviewNavBar } from "@/lib/components/PreviewNavBar";
import {
  type DesignVariation,
  isValidVariationTab,
  variationKeyFromIndex,
} from "../_utils/designVariations";

/** Tab label for a zero-based variation index: 0 -> "A". */
function variationLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

interface DesignVariationsPanelProps {
  previewUrl: string | null;
  sandboxRunning: boolean;
  isArchived: boolean;
  isExecuting: boolean;
  latestVariations: DesignVariation[];
  isSandboxStarting: boolean;
  onStartSandbox: () => void;
  /** Hands the composer a prompt for the variation on screen. */
  onUseVariation: (letter: string, label: string) => void;
}

export function DesignVariationsPanel({
  previewUrl,
  sandboxRunning,
  isArchived,
  isExecuting,
  latestVariations,
  isSandboxStarting,
  onStartSandbox,
  onUseVariation,
}: DesignVariationsPanelProps) {
  const [{ variation: tab, view }, setDesignParams] = useQueryStates({
    variation: designVariationParser,
    view: viewModeParser,
  });
  const activeTabIndex = isValidVariationTab(tab, latestVariations.length)
    ? Number(tab)
    : 0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRefs = useRef<Map<number, HTMLIFrameElement>>(new Map());
  const activeIframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    activeIframeRef.current = iframeRefs.current.get(activeTabIndex) ?? null;
  }, [activeTabIndex]);

  /* eslint-disable no-effect/no-event-handler --
     Repairs a `?variation=` value that the URL can carry before the variations
     arrive from the server, so the trigger is the query landing. */
  useEffect(() => {
    if (
      latestVariations.length > 0 &&
      !isValidVariationTab(tab, latestVariations.length)
    ) {
      void setDesignParams({ variation: "0" });
    }
  }, [latestVariations.length, setDesignParams, tab]);
  /* eslint-enable no-effect/no-event-handler */

  return (
    <div className="flex h-full min-w-0 flex-col">
      <AnimatePresence mode="wait" initial={false}>
        {latestVariations.length === 0 ? (
          <m.div
            key="empty"
            className="flex h-full items-center justify-center text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionBase}
          >
            <div className="max-w-md space-y-3 px-6 text-center">
              <IconPalette className="mx-auto h-10 w-10 text-muted-foreground/60" />
              <p className="text-sm">
                {isExecuting
                  ? "Generating designs..."
                  : "Run /eva-design in the composer — variations will appear here."}
              </p>
            </div>
          </m.div>
        ) : (
          <m.div
            key="populated"
            ref={containerRef}
            className="flex h-full min-w-0 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionBase}
          >
            <Tabs
              value={String(activeTabIndex)}
              onValueChange={(v) => {
                if (isValidVariationTab(v, latestVariations.length)) {
                  void setDesignParams({ variation: v });
                }
              }}
              className="flex h-full flex-col"
            >
              <div className="relative flex items-end bg-secondary/50 px-2 pt-1.5">
                <TabsList className="h-auto gap-0 rounded-none border-0 bg-transparent p-0 shadow-none">
                  {latestVariations.map((_, i) => (
                    <ListEnter key={i} index={i} fast className="inline-flex">
                      <TabsTrigger
                        value={String(i)}
                        className="relative flex items-center gap-1.5 rounded-none rounded-t-md border border-b-0 px-4 py-1.5 text-sm font-medium data-[state=active]:z-10 data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:shadow-none data-[state=inactive]:border-transparent data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-secondary data-[state=inactive]:hover:text-foreground"
                      >
                        Design {variationLetter(i)}
                      </TabsTrigger>
                    </ListEnter>
                  ))}
                </TabsList>
                <div className="absolute bottom-0 left-0 right-0 h-px bg-border" />
              </div>
              <div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
                <Tabs
                  value={view}
                  onValueChange={(v) => {
                    if (v === "desktop" || v === "mobile") {
                      void setDesignParams({ view: v });
                    }
                  }}
                >
                  <TabsList className="h-8">
                    <TabsTrigger
                      value="desktop"
                      className="max-sm:hit-target px-2 text-xs"
                      aria-label="Frame designs as desktop"
                    >
                      <IconDeviceDesktop size={14} />
                    </TabsTrigger>
                    <TabsTrigger
                      value="mobile"
                      className="max-sm:hit-target px-2 text-xs"
                      aria-label="Frame designs as mobile"
                    >
                      <IconDeviceMobile size={14} />
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <PreviewNavBar
                  previewUrl={previewUrl}
                  iframeRef={activeIframeRef}
                  containerRef={containerRef}
                  port={3000}
                  defaultPath="/design-preview"
                />
              </div>
              {latestVariations.map((variation, i) => (
                <TabsContent
                  key={i}
                  value={String(i)}
                  className="relative m-0 min-h-0 flex-1 bg-muted/30"
                >
                  <div
                    className={`absolute inset-0 transition-[width,height,inset] duration-[var(--motion-fast)] ${view === "mobile" ? "mx-auto my-auto aspect-9/16 max-h-full overflow-hidden rounded-surface border border-border bg-background" : ""}`}
                  >
                    {previewUrl ? (
                      <iframe
                        ref={(el) => {
                          if (el) {
                            iframeRefs.current.set(i, el);
                          } else {
                            iframeRefs.current.delete(i);
                          }
                        }}
                        src={`${previewUrl}/design-preview?v=${variationKeyFromIndex(i)}`}
                        className="h-full w-full border-0"
                        title={variation.label}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          {sandboxRunning ? (
                            <Spinner size="md" />
                          ) : (
                            <>
                              <p className="mb-2 text-sm">
                                {isArchived
                                  ? "Sandbox not available for archived sessions"
                                  : "Sandbox not running"}
                              </p>
                              {!isArchived && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={onStartSandbox}
                                  disabled={isSandboxStarting}
                                >
                                  <IconPlayerPlay size={14} />
                                  {isSandboxStarting
                                    ? "Starting..."
                                    : "Wake up Eva"}
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              ))}
              <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
                {!isArchived && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 shrink-0 gap-1 text-xs"
                    onClick={() =>
                      onUseVariation(
                        variationLetter(activeTabIndex),
                        latestVariations[activeTabIndex]?.label ?? "",
                      )
                    }
                  >
                    <IconCheck size={14} />
                    Use this design
                  </Button>
                )}
                <p className="truncate text-xs text-muted-foreground">
                  {latestVariations[activeTabIndex]?.label}
                </p>
              </div>
            </Tabs>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

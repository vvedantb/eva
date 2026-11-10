"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  tokenTransition,
} from "@vvedantb/ui";
import { IconSparkles } from "@tabler/icons-react";
import { m, AnimatePresence } from "motion/react";
import { StreamingActivityDisplay } from "@/lib/components/StreamingActivityDisplay";

interface SessionSummaryAccordionProps {
  summary?: string[];
  summaryStreamingActivity?: string;
}

export function SessionSummaryAccordion({
  summary,
  summaryStreamingActivity,
}: SessionSummaryAccordionProps) {
  const hasSummary = Boolean(summary && summary.length > 0);
  const showSummaryStreaming = Boolean(summaryStreamingActivity);

  if (!showSummaryStreaming && !hasSummary) return null;

  return (
    <AnimatePresence initial={false}>
      <m.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={tokenTransition.base}
      >
        <Accordion
          type="single"
          collapsible
          defaultValue={showSummaryStreaming ? "summary" : undefined}
          className="mx-auto w-full min-w-0 max-w-3xl rounded-b-lg border-x border-b border-border bg-card px-3 sm:px-6"
        >
          <AccordionItem value="summary" className="border-b-0">
            <AccordionTrigger className="py-2 text-sm">
              <div className="flex flex-row items-center gap-2 text-foreground">
                <IconSparkles size={14} className="text-muted-foreground" />
                <p>Session summary</p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2">
              {showSummaryStreaming ? (
                <StreamingActivityDisplay activity={summaryStreamingActivity} />
              ) : hasSummary ? (
                <ul className="list-inside list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  {summary?.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </m.div>
    </AnimatePresence>
  );
}

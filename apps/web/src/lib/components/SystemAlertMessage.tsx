"use client";

import { useState } from "react";
import { m } from "motion/react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  tokenTransition,
  RelativeDateTime,
} from "@vvedantb/ui";
import { IconAlertTriangle } from "@tabler/icons-react";

interface SystemAlertMessageProps {
  content: string;
  errorDetail?: string;
  timestamp?: number;
}

export function SystemAlertMessage({
  content,
  errorDetail,
  timestamp,
}: SystemAlertMessageProps) {
  const [showError, setShowError] = useState(false);

  return (
    <>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={tokenTransition.base}
        className="flex items-center gap-3 py-1"
      >
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap max-w-[60%] truncate sm:max-w-none sm:truncate-none">
          {content}
          {timestamp !== undefined ? (
            <>
              <span className="ml-1.5 text-muted-foreground/70 font-normal">
                ·
              </span>
              <RelativeDateTime
                at={timestamp}
                className="ml-1 text-muted-foreground/70 font-normal"
              />
            </>
          ) : null}
        </span>
        {errorDetail && (
          <button
            type="button"
            onClick={() => setShowError(true)}
            className="max-sm:hit-target text-xs font-medium text-destructive hover:underline whitespace-nowrap"
          >
            View error
          </button>
        )}
        <div className="h-px flex-1 bg-border" />
      </m.div>
      {errorDetail && (
        <Dialog open={showError} onOpenChange={setShowError}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <IconAlertTriangle size={16} className="text-destructive" />
                Sandbox Error
              </DialogTitle>
            </DialogHeader>
            <pre className="whitespace-pre-wrap max-sm:wrap-break-word text-sm text-muted-foreground bg-muted rounded-surface p-4 max-h-[min(16rem,50dvh)] overflow-y-auto scroll-fade">
              {errorDetail}
            </pre>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowError(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import {
  Button,
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@eva/ui";

/** Match t3code MessagesTimeline collapsible user prompts. */
const MAX_COLLAPSED_USER_MESSAGE_LINES = 8;
const MAX_COLLAPSED_USER_MESSAGE_LENGTH = 600;
const COLLAPSED_USER_MESSAGE_FADE_HEIGHT_REM = 1.75;
const COLLAPSED_USER_MESSAGE_FADE_MASK = `linear-gradient(to bottom, black calc(100% - ${COLLAPSED_USER_MESSAGE_FADE_HEIGHT_REM}rem), transparent)`;

function shouldCollapseUserMessage(text: string): boolean {
  if (text.trim().length === 0) {
    return false;
  }
  return (
    text.length > MAX_COLLAPSED_USER_MESSAGE_LENGTH ||
    text.split("\n").length > MAX_COLLAPSED_USER_MESSAGE_LINES
  );
}

interface CollapsibleUserMessageBodyProps {
  text: string;
  children: ReactNode;
}

/**
 * Collapses long user prompts behind "Show full message", same thresholds as
 * [t3code](https://github.com/pingdotgg/t3code) MessagesTimeline.
 */
export function CollapsibleUserMessageBody({
  text,
  children,
}: CollapsibleUserMessageBodyProps) {
  const [expanded, setExpanded] = useState(false);
  const canCollapse = shouldCollapseUserMessage(text);
  const isCollapsed = canCollapse && !expanded;

  if (!canCollapse) {
    return (
      <div
        className="relative"
        data-user-message-collapsed="false"
        data-user-message-collapsible="false"
      >
        {children}
      </div>
    );
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div
        className={cn(
          "relative max-h-44 overflow-hidden",
          !isCollapsed && "hidden",
        )}
        data-user-message-collapsed="true"
        data-user-message-collapsible="true"
        style={{
          WebkitMaskImage: COLLAPSED_USER_MESSAGE_FADE_MASK,
          maskImage: COLLAPSED_USER_MESSAGE_FADE_MASK,
        }}
      >
        {children}
      </div>
      <CollapsibleContent>
        <div
          className="relative"
          data-user-message-collapsed="false"
          data-user-message-collapsible="true"
        >
          {children}
        </div>
      </CollapsibleContent>
      <div className="mt-1.5 flex items-center justify-start">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={expanded}
            className="-ml-1.5 h-6 rounded-md px-1.5 text-xs font-normal text-muted-foreground/72 hover:bg-muted/55 hover:text-foreground/85"
          >
            {expanded ? "Show less" : "Show full message"}
          </Button>
        </CollapsibleTrigger>
      </div>
    </Collapsible>
  );
}

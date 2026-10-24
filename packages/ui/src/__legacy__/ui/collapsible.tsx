"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import type { ComponentProps } from "react";

import { cn } from "../utils/cn";

const Collapsible = CollapsiblePrimitive.Root;

function CollapsibleTrigger({
  className,
  ...props
}: ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      className={cn("cursor-pointer", className)}
      {...props}
    />
  );
}

export type CollapsibleContentProps = ComponentProps<
  typeof CollapsiblePrimitive.CollapsibleContent
>;

/**
 * Wrapped rather than re-exported so every panel in the app opens and closes
 * along the same measured-height path. The bare primitive animates nothing, so
 * all 50-odd collapsibles used to snap. `t-collapsible-content` lives in
 * globals.css next to the accordion equivalent.
 */
const CollapsibleContent = ({
  className,
  ...props
}: CollapsibleContentProps) => (
  <CollapsiblePrimitive.CollapsibleContent
    className={cn("t-collapsible-content", className)}
    {...props}
  />
);

export { Collapsible, CollapsibleTrigger, CollapsibleContent };

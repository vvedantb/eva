"use client";

import type { ComponentProps, HTMLAttributes } from "react";
import { createContext, useContext } from "react";
import { Badge } from "../ui/badge";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { cn } from "../utils/cn";
import { SURFACE_RADIUS_CLASS } from "../utils/surface-radius";

type SandboxState = "pending" | "running" | "completed" | "error";

interface SandboxContextValue {
  state: SandboxState;
}

const SandboxContext = createContext<SandboxContextValue | null>(null);

const stateBadgeConfig: Record<
  SandboxState,
  {
    label: string;
    variant: "warning" | "default" | "success" | "destructive";
  }
> = {
  pending: { label: "Pending", variant: "warning" },
  running: { label: "Running", variant: "default" },
  completed: { label: "Completed", variant: "success" },
  error: { label: "Error", variant: "destructive" },
};

export type SandboxProps = HTMLAttributes<HTMLDivElement> & {
  state: SandboxState;
};

export const Sandbox = ({
  state,
  className,
  children,
  ...props
}: SandboxProps) => (
  <SandboxContext.Provider value={{ state }}>
    <div
      className={cn("border bg-background", SURFACE_RADIUS_CLASS, className)}
      {...props}
    >
      {children}
    </div>
  </SandboxContext.Provider>
);

export type SandboxContentProps = HTMLAttributes<HTMLDivElement>;

export const SandboxContent = (props: SandboxContentProps) => (
  <div {...props} />
);

export type SandboxTabsProps = ComponentProps<typeof Tabs>;

export const SandboxTabs = (props: SandboxTabsProps) => <Tabs {...props} />;

export type SandboxTabsListProps = ComponentProps<typeof TabsList>;

export const SandboxTabsList = ({
  children,
  className,
  ...props
}: SandboxTabsListProps) => {
  const context = useContext(SandboxContext);
  const badge = context ? stateBadgeConfig[context.state] : null;

  return (
    <div className="flex items-center border-b">
      <TabsList
        className={cn(
          "h-auto flex-1 justify-start rounded-none bg-transparent p-0",
          className,
        )}
        {...props}
      >
        {children}
      </TabsList>
      {badge && (
        <Badge className="mr-3" variant={badge.variant}>
          {badge.label}
        </Badge>
      )}
    </div>
  );
};

export type SandboxTabsTriggerProps = ComponentProps<typeof TabsTrigger>;

export const SandboxTabsTrigger = ({
  className,
  ...props
}: SandboxTabsTriggerProps) => (
  <TabsTrigger
    className={cn(
      "rounded-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none",
      className,
    )}
    {...props}
  />
);

export type SandboxTabContentProps = ComponentProps<typeof TabsContent>;

export const SandboxTabContent = ({
  className,
  ...props
}: SandboxTabContentProps) => (
  <TabsContent className={cn("mt-0 p-3", className)} {...props} />
);

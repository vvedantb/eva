"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type QuickTaskHeaderActionsSlotContextValue = {
  actionsElement: HTMLDivElement | null;
  titleAfterElement: HTMLDivElement | null;
  setActionsElement: (element: HTMLDivElement | null) => void;
  setTitleAfterElement: (element: HTMLDivElement | null) => void;
};

const QuickTaskHeaderActionsSlotContext =
  createContext<QuickTaskHeaderActionsSlotContextValue | null>(null);

export function QuickTaskHeaderActionsSlotProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [actionsElement, setActionsElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [titleAfterElement, setTitleAfterElement] =
    useState<HTMLDivElement | null>(null);

  return (
    <QuickTaskHeaderActionsSlotContext
      value={{
        actionsElement,
        titleAfterElement,
        setActionsElement,
        setTitleAfterElement,
      }}
    >
      {children}
    </QuickTaskHeaderActionsSlotContext>
  );
}

export function useQuickTaskHeaderActionsSlot() {
  return useContext(QuickTaskHeaderActionsSlotContext);
}

/** Mount point for task actions between context usage and prev/next controls. */
export function QuickTaskHeaderActionsSlot() {
  const slot = useQuickTaskHeaderActionsSlot();
  if (!slot) {
    return null;
  }

  const { setActionsElement } = slot;

  return (
    <div
      ref={setActionsElement}
      className="flex shrink-0 items-center gap-1.5 sm:gap-2"
    />
  );
}

/** Mount point beside the breadcrumb for the task surface switcher. */
export function QuickTaskHeaderTitleSlot() {
  const slot = useQuickTaskHeaderActionsSlot();
  if (!slot) {
    return null;
  }

  const { setTitleAfterElement } = slot;

  return (
    <div ref={setTitleAfterElement} className="flex shrink-0 items-center" />
  );
}

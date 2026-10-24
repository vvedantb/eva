"use client";

import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { cn } from "@eva/ui";
import { Button } from "@vvedantb/ui";

type SetHeaderAction = (node: ReactNode) => void;

const HeaderActionContext = createContext<SetHeaderAction | null>(null);

/**
 * Lets context sidebars (docs, designs, …) park a single icon button at the
 * right end of the panel header instead of in a search/toolbar row.
 */
export function ContextSidebarHeaderActionProvider({
  children,
}: {
  children: (headerAction: ReactNode) => ReactNode;
}) {
  const [headerAction, setHeaderAction] = useState<ReactNode>(null);
  return (
    <HeaderActionContext value={setHeaderAction}>
      {children(headerAction)}
    </HeaderActionContext>
  );
}

/** Registers an icon button in the context sidebar header; renders nothing. */
export function ContextSidebarHeaderIconButton({
  title,
  onClick,
  icon: Icon,
  className,
}: {
  title: string;
  onClick: () => void;
  icon: ComponentType<{ size?: number; className?: string }>;
  className?: string;
}) {
  const setHeaderAction = use(HeaderActionContext);
  // Written in an effect (not during render) so React Compiler can compile the
  // file; clicks on the parked button only happen after commit.
  const onClickRef = useRef(onClick);
  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  useLayoutEffect(() => {
    if (!setHeaderAction) return;
    setHeaderAction(
      <Button
        size="icon-sm"
        variant="ghost"
        className={cn("h-8 w-8 shrink-0 text-sidebar-primary", className)}
        title={title}
        aria-label={title}
        onClick={() => onClickRef.current()}
      >
        <Icon size={16} />
      </Button>,
    );
    return () => setHeaderAction(null);
  }, [setHeaderAction, title, className, Icon]);

  return null;
}

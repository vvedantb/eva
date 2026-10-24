"use client";

import type { ComponentProps, ReactNode, Ref, RefObject } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { IconBug, IconTerminal2 } from "@tabler/icons-react";
import { cn } from "../utils/cn";
import { SURFACE_RADIUS_CLASS } from "../utils/surface-radius";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export interface WebPreviewContextValue {
  url: string;
  setUrl: (url: string) => void;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  reload: () => void;
  goBack: () => void;
  goForward: () => void;
}

const WebPreviewContext = createContext<WebPreviewContextValue | null>(null);

export const useWebPreview = () => {
  const context = useContext(WebPreviewContext);
  if (!context) {
    throw new Error("WebPreview components must be used within a WebPreview");
  }
  return context;
};

export type WebPreviewProps = ComponentProps<"div"> & {
  defaultUrl?: string;
  onUrlChange?: (url: string) => void;
  ref?: Ref<HTMLDivElement>;
};

export const WebPreview = ({
  className,
  children,
  defaultUrl = "",
  onUrlChange,
  ref,
  ...props
}: WebPreviewProps) => {
  const [url, setUrl] = useState(defaultUrl);
  const [, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const handleUrlChange = useCallback(
    (newUrl: string) => {
      setUrl(newUrl);
      onUrlChange?.(newUrl);
    },
    [onUrlChange],
  );

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const goBack = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.history.back();
    } catch {}
  }, []);

  const goForward = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.history.forward();
    } catch {}
  }, []);

  const contextValue = useMemo<WebPreviewContextValue>(
    () => ({
      setUrl: handleUrlChange,
      url,
      iframeRef,
      reload,
      goBack,
      goForward,
    }),
    [handleUrlChange, url, reload, goBack, goForward],
  );

  return (
    <WebPreviewContext.Provider value={contextValue}>
      <div
        ref={ref}
        className={cn(
          "flex size-full flex-col border bg-card",
          SURFACE_RADIUS_CLASS,
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </WebPreviewContext.Provider>
  );
};

export type WebPreviewNavigationProps = ComponentProps<"div">;

export const WebPreviewNavigation = ({
  className,
  children,
  ...props
}: WebPreviewNavigationProps) => (
  <div
    // `flex-wrap`: the nav holds back/forward/reload plus a URL field and a
    // device toggle, which is wider than a phone-width preview pane. Without it
    // the row overflows its container rather than taking a second line.
    className={cn("flex items-center gap-1 border-b p-2 max-sm:flex-wrap", className)}
    {...props}
  >
    {children}
  </div>
);

export type WebPreviewNavigationButtonProps = ComponentProps<typeof Button> & {
  tooltip?: string;
};

export const WebPreviewNavigationButton = ({
  onClick,
  disabled,
  tooltip,
  children,
  ...props
}: WebPreviewNavigationButtonProps) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="h-8 w-8 p-0 hover:text-foreground"
          disabled={disabled}
          onClick={onClick}
          size="sm"
          variant="ghost"
          // These buttons are icon-only, and a `TooltipContent` is wired up as
          // `aria-describedby` — a description, not a name — so without this
          // every preview nav control is announced as just "button". Placed
          // before the spread so a call site can still override it.
          aria-label={tooltip}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export type WebPreviewUrlProps = ComponentProps<typeof Input>;

export const WebPreviewUrl = ({
  value,
  onChange,
  onKeyDown,
  ...props
}: WebPreviewUrlProps) => {
  const { url, setUrl } = useWebPreview();
  const [prevUrl, setPrevUrl] = useState(url);
  const [inputValue, setInputValue] = useState(url);

  if (url !== prevUrl) {
    setPrevUrl(url);
    setInputValue(url);
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
    onChange?.(event);
  };

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        setUrl(event.currentTarget.value);
      }
      onKeyDown?.(event);
    },
    [setUrl, onKeyDown],
  );

  return (
    <Input
      className="h-8 flex-1 text-sm"
      onChange={onChange ?? handleChange}
      onKeyDown={handleKeyDown}
      placeholder="Enter URL..."
      value={value ?? inputValue}
      {...props}
    />
  );
};

export type WebPreviewBodyProps = Omit<ComponentProps<"iframe">, "loading"> & {
  loading?: ReactNode;
};

function ensureHttps(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export const WebPreviewBody = ({
  className,
  loading,
  src,
  ...props
}: WebPreviewBodyProps) => {
  const { url, iframeRef } = useWebPreview();
  const rawSrc = (src ?? url) || undefined;
  const safeSrc = rawSrc ? ensureHttps(rawSrc) : undefined;

  return (
    <div className="flex-1 h-full relative overflow-hidden min-h-0">
      <iframe
        ref={iframeRef}
        className={cn("size-full", className)}
        src={safeSrc}
        title="Preview"
        {...props}
      />
      {loading}
    </div>
  );
};

export type WebPreviewConsoleProps = ComponentProps<"div"> & {
  logs?: {
    level: "log" | "warn" | "error";
    message: string;
    timestamp: Date;
  }[];
  terminal?: ReactNode;
};

export const WebPreviewConsole = ({
  className,
  logs = [],
  terminal,
  children,
  ...props
}: WebPreviewConsoleProps) => {
  const [activeTab, setActiveTab] = useState<"console" | "terminal">(
    terminal ? "terminal" : "console",
  );

  return (
    <div className={cn("border-t bg-muted/50 text-sm", className)} {...props}>
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          if (v === "console" || v === "terminal") setActiveTab(v);
        }}
        className="h-full flex flex-col"
      >
        <TabsList className="w-full justify-start rounded-none bg-transparent px-2 h-9">
          <TabsTrigger
            value="console"
            className="text-xs px-3 rounded-none gap-1.5"
          >
            <IconBug className="w-3.5 h-3.5" />
            Console
          </TabsTrigger>
          {terminal && (
            <TabsTrigger
              value="terminal"
              className="text-xs px-3 rounded-none gap-1.5"
            >
              <IconTerminal2 className="w-3.5 h-3.5" />
              Terminal
            </TabsTrigger>
          )}
        </TabsList>
        <div className="flex-1 min-h-0">
          <div
            className={cn(
              "h-64 space-y-1 overflow-y-auto scrollbar px-4 py-3 font-mono",
              activeTab !== "console" && "hidden",
            )}
          >
            {logs.length === 0 ? (
              <p className="text-muted-foreground text-xs">No console output</p>
            ) : (
              logs.map((log, index) => (
                <div
                  className={cn(
                    "text-xs",
                    log.level === "error" && "text-destructive",
                    log.level === "warn" && "text-warning",
                    log.level === "log" && "text-foreground",
                  )}
                  key={`${log.timestamp.getTime()}-${index}`}
                >
                  <span className="text-muted-foreground">
                    {log.timestamp.toLocaleTimeString()}
                  </span>{" "}
                  {log.message}
                </div>
              ))
            )}
            {children}
          </div>
          {terminal && (
            <div
              className={cn(
                "h-64 overflow-y-auto scrollbar",
                activeTab !== "terminal" && "hidden",
              )}
            >
              {terminal}
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
};

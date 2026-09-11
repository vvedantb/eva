import { useState } from "react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@eva/ui";
import { IconCopy, IconCheck, IconPlayerStop } from "@tabler/icons-react";
import { toast } from "sonner";
import type { PresentationSync } from "../usePresentationSync";

interface PresentationHostBarProps {
  sync: PresentationSync;
  onOpenChange: (open: boolean) => void;
}

export function PresentationHostBar({
  sync,
  onOpenChange,
}: PresentationHostBarProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    if (!sync.shareUrl) return;
    try {
      await navigator.clipboard.writeText(sync.shareUrl);
      setCopied(true);
      toast.success("Share link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full bg-card px-3.5 py-2 text-sm font-medium text-card-foreground shadow-lg backdrop-blur transition-[background-color] hover:bg-secondary"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          Live
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Share link
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={sync.shareUrl ?? ""}
              className="h-9 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={() => void copyLink()}
              title={copied ? "Copied" : "Copy link"}
            >
              {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
            </Button>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Anyone with the link follows your slides live.
        </p>

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-destructive hover:text-destructive"
          onClick={() => void sync.stopSharing()}
        >
          <IconPlayerStop size={15} /> Stop sharing
        </Button>
      </PopoverContent>
    </Popover>
  );
}

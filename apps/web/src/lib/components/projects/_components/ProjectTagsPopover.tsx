"use client";

import { useRef, useState } from "react";
import {
  Badge,
  Input,
  Popover,
  PopoverTrigger,
  PopoverContent,
  cn,
} from "@eva/ui";
import { IconTags } from "@tabler/icons-react";
import { FIELD_TEXT_CLASS } from "@/lib/components/fields/FieldsSection";

interface ProjectTagsPopoverProps {
  tags: string[] | undefined;
  onUpdate: (tags: string[]) => void;
  /** Trigger classes — lets a field-row caller swap the inline bar sizing. */
  className?: string;
}

export function ProjectTagsPopover({
  tags,
  onUpdate,
  className,
}: ProjectTagsPopoverProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const currentTags = tags ?? [];

  const addTag = (raw: string) => {
    const value = raw.trim();
    if (!value || currentTags.includes(value)) return;
    onUpdate([...currentTags, value]);
  };

  const removeTag = (tag: string) => {
    onUpdate(currentTags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
      e.preventDefault();
      addTag(draft);
      setDraft("");
    }
    if (e.key === "Backspace" && draft === "" && currentTags.length > 0) {
      removeTag(currentTags[currentTags.length - 1]);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 transition-colors hover:bg-muted/60",
            FIELD_TEXT_CLASS,
            currentTags.length === 0 && "text-muted-foreground",
            className,
          )}
        >
          <IconTags size={14} className="text-muted-foreground shrink-0" />
          <span>
            {currentTags.length > 0
              ? `${currentTags.length} tag${currentTags.length > 1 ? "s" : ""}`
              : "Tags"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-2">
          {currentTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {currentTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-xs h-5 gap-0.5 pr-0.5"
                >
                  {tag}
                  <button
                    type="button"
                    className="rounded-sm opacity-50 hover:opacity-100 transition-opacity ml-0.5 px-0.5"
                    onClick={() => removeTag(tag)}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <Input
            ref={inputRef}
            value={draft}
            placeholder="Add tag..."
            className="h-7 text-[13px]"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft.trim()) {
                addTag(draft);
                setDraft("");
              }
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

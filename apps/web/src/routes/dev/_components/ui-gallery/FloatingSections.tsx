import {
  Avatar,
  AvatarFallback,
  Button,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Input,
  Label,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@eva/ui";
import { IconCalendar, IconInfoCircle } from "@tabler/icons-react";
import { GalleryGroup, GalleryItem } from "./GalleryItem";

const noop = () => {};
const skipAutoFocus = (event: Event) => event.preventDefault();

export function PopoverSection() {
  return (
    <GalleryGroup title="Popover (open, controlled)" className="gap-[360px]">
      <GalleryItem label="PopoverTrigger + PopoverContent with form">
        <Popover open onOpenChange={noop}>
          <PopoverTrigger asChild>
            <Button variant="outline">Dimensions</Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72"
            onOpenAutoFocus={skipAutoFocus}
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h4 className="text-sm font-semibold">Dimensions</h4>
                <p className="text-sm text-muted-foreground">
                  Set the size of the layer.
                </p>
              </div>
              <div className="grid grid-cols-3 items-center gap-2">
                <Label htmlFor="g-pop-width">Width</Label>
                <Input id="g-pop-width" defaultValue="100%" className="col-span-2 h-8" />
                <Label htmlFor="g-pop-height">Height</Label>
                <Input id="g-pop-height" defaultValue="25px" className="col-span-2 h-8" />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost">
                  Reset
                </Button>
                <Button size="sm">Apply</Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </GalleryItem>
      <GalleryItem label="PopoverAnchor + side=right">
        <Popover open onOpenChange={noop}>
          <PopoverAnchor asChild>
            <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
              <IconCalendar className="size-4" /> Anchor
            </span>
          </PopoverAnchor>
          <PopoverContent side="right" onOpenAutoFocus={skipAutoFocus}>
            <p className="text-sm">Anchored to the chip, not a trigger.</p>
          </PopoverContent>
        </Popover>
      </GalleryItem>
    </GalleryGroup>
  );
}

export function HoverCardSection() {
  return (
    <GalleryGroup title="HoverCard (open, controlled)">
      <GalleryItem label="HoverCardTrigger + HoverCardContent">
        <HoverCard open onOpenChange={noop}>
          <HoverCardTrigger asChild>
            <Button variant="link">@eva</Button>
          </HoverCardTrigger>
          <HoverCardContent align="start" className="w-80">
            <div className="flex gap-3">
              <Avatar>
                <AvatarFallback>EV</AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1">
                <h4 className="text-sm font-semibold">eva</h4>
                <p className="text-sm">
                  Runs your codebases in remote sandboxes.
                </p>
                <span className="text-xs text-muted-foreground">
                  Joined March 2025
                </span>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
      </GalleryItem>
    </GalleryGroup>
  );
}

const TOOLTIP_SIDES = ["top", "right", "bottom", "left"] as const;

export function TooltipSection() {
  return (
    <GalleryGroup title="Tooltip (open, controlled)" className="gap-24 px-16 py-12">
      {TOOLTIP_SIDES.map((side) => (
        <GalleryItem key={side} label={`side=${side}`}>
          <Tooltip open onOpenChange={noop}>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" aria-label={side}>
                <IconInfoCircle />
              </Button>
            </TooltipTrigger>
            <TooltipContent side={side}>Tooltip {side}</TooltipContent>
          </Tooltip>
        </GalleryItem>
      ))}
      <GalleryItem label="multi-line">
        <Tooltip open onOpenChange={noop}>
          <TooltipTrigger asChild>
            <Button variant="secondary">Long tooltip</Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-56">
            Tooltips wrap when the text is longer than the max width.
          </TooltipContent>
        </Tooltip>
      </GalleryItem>
    </GalleryGroup>
  );
}

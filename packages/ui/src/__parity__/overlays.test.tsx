// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import * as Next from "@vvedantb/ui";
import { UiConfigProvider } from "@vvedantb/ui";
import { evaUiConfig } from "../config";
import { menuContentClass } from "../config/overlays";
import * as LegacyDialog from "../__legacy__/ui/dialog";
import * as LegacySheet from "../__legacy__/ui/sheet";
import * as LegacyPopover from "../__legacy__/ui/popover";
import * as LegacyHoverCard from "../__legacy__/ui/hover-card";
import * as LegacyTooltip from "../__legacy__/ui/tooltip";
import * as LegacyDropdown from "../__legacy__/ui/dropdown-menu";
import * as LegacyContext from "../__legacy__/ui/context-menu";
import * as LegacySelect from "../__legacy__/ui/select";
import * as LegacyCommand from "../__legacy__/ui/command";
import { renderPair } from "./harness";

type Case = {
  name: string;
  legacy: ReactNode;
  next: ReactNode;
  interact?: () => void;
  /** Applied to both serialisations; every use carries its reason. */
  normalise?: (html: string) => string;
};

async function expectParity({ legacy, next, interact, normalise = (html) => html }: Case) {
  const pair = await renderPair(legacy, next, evaUiConfig, interact);
  expect(normalise(pair.next)).toBe(normalise(pair.legacy));
  return pair;
}

function runCases(cases: Case[]) {
  for (const c of cases) {
    it(c.name, async () => {
      const { next } = await expectParity(c);
      // Guard against comparing two empty portals.
      if (c.name.startsWith("open")) expect(next).toMatch(/role="(dialog|menu|listbox|tooltip)"|data-side=/);
    });
  }
}

/**
 * vvedantb's `DialogFooter` always carries `data-slot="dialog-footer"`; eva's did
 * not. Invisible: no eva selector reads it (grep `dialog-footer` in apps/web and
 * packages/ui), and vvedantb only targets it from the compact layout, which eva
 * turns off with `viewportAware: false`.
 */
const stripFooterSlot = (html: string) => html.replaceAll(' data-slot="dialog-footer"', "");

// ---------------------------------------------------------------------------
// Dialog

function dialogTree(
  D: typeof LegacyDialog | typeof Next,
  props: {
    content?: { className?: string; hideCloseButton?: boolean; "data-testid"?: string };
    header?: string;
    title?: string;
    description?: string | null;
    body?: string | null;
    footer?: string;
  } = {},
) {
  return (
    <D.Dialog open>
      <D.DialogContent {...props.content}>
        <D.DialogHeader className={props.header}>
          <D.DialogTitle className={props.title}>Title</D.DialogTitle>
          {props.description === null ? null : (
            <D.DialogDescription className={props.description}>Description</D.DialogDescription>
          )}
        </D.DialogHeader>
        {props.body === null ? null : <D.DialogBody className={props.body}>Body</D.DialogBody>}
        <D.DialogFooter className={props.footer}>
          <D.DialogClose asChild>
            <button type="button">Cancel</button>
          </D.DialogClose>
        </D.DialogFooter>
      </D.DialogContent>
    </D.Dialog>
  );
}

/** `className` combinations from apps/web call sites (80 DialogContent sites, 13 DialogBody). */
const dialogVariants: Parameters<typeof dialogTree>[1][] = [
  {},
  { body: null },
  { description: null },
  { content: { className: "max-w-sm" } },
  { content: { className: "sm:max-w-lg" } },
  { content: { className: "max-w-2xl", hideCloseButton: true } },
  { content: { className: "max-w-2xl gap-0 p-0" }, header: "px-6 pb-3 pt-6", footer: "border-t border-border px-6 py-3" },
  { content: { className: "max-w-lg", "data-testid": "message-fork-dialog" }, body: "space-y-3 text-sm" },
  {
    content: {
      className: "h-[92dvh] max-w-[96vw] overflow-hidden border-0 bg-black/90 p-0 shadow-none sm:max-w-[96vw]",
    },
  },
  { content: { className: "h-[min(28rem,70dvh)] max-w-xl gap-0 overflow-hidden p-0", hideCloseButton: true } },
  { content: { className: "max-w-[calc(100vw-2rem)] w-full max-h-[95dvh] flex flex-col sm:max-w-5xl" } },
  { content: { className: "max-h-[80dvh] max-w-2xl gap-0 overflow-hidden p-0" } },
  { header: "pr-8", title: "text-base", description: "font-mono text-xs" },
  { header: "shrink-0", title: "flex items-center gap-2", description: "max-sm:break-all", body: "flex flex-col gap-4" },
  { title: "sr-only", description: "min-h-10", body: "flex min-h-0 flex-1 flex-col" },
  { footer: "flex-col-reverse gap-2 px-5 py-3 sm:flex-row sm:justify-between", description: "text-xs" },
  { footer: "shrink-0 gap-2 sm:justify-between", body: "space-y-4 text-sm" },
];

describe("Dialog", () => {
  runCases(
    dialogVariants.map((variant, i) => ({
      name: `open #${i} ${JSON.stringify(variant)}`,
      legacy: dialogTree(LegacyDialog, variant),
      next: dialogTree(Next, variant),
      normalise: stripFooterSlot,
    })),
  );

  runCases([
    {
      name: "closed, trigger asChild",
      legacy: (
        <LegacyDialog.Dialog>
          <LegacyDialog.DialogTrigger asChild>
            <button type="button">Open</button>
          </LegacyDialog.DialogTrigger>
        </LegacyDialog.Dialog>
      ),
      next: (
        <Next.Dialog>
          <Next.DialogTrigger asChild>
            <button type="button">Open</button>
          </Next.DialogTrigger>
        </Next.Dialog>
      ),
    },
    {
      name: "closed, plain trigger with className",
      legacy: (
        <LegacyDialog.Dialog>
          <LegacyDialog.DialogTrigger className="text-sm">Open</LegacyDialog.DialogTrigger>
        </LegacyDialog.Dialog>
      ),
      next: (
        <Next.Dialog>
          <Next.DialogTrigger className="text-sm">Open</Next.DialogTrigger>
        </Next.Dialog>
      ),
    },
    {
      name: "trigger click opens",
      legacy: (
        <LegacyDialog.Dialog>
          <LegacyDialog.DialogTrigger>Open</LegacyDialog.DialogTrigger>
          <LegacyDialog.DialogContent>
            <LegacyDialog.DialogTitle>T</LegacyDialog.DialogTitle>
          </LegacyDialog.DialogContent>
        </LegacyDialog.Dialog>
      ),
      next: (
        <Next.Dialog>
          <Next.DialogTrigger>Open</Next.DialogTrigger>
          <Next.DialogContent>
            <Next.DialogTitle>T</Next.DialogTitle>
          </Next.DialogContent>
        </Next.Dialog>
      ),
      interact: () => document.querySelector("button")?.click(),
    },
  ]);

  it("stays a centred dialog on a phone-sized viewport", async () => {
    // Only vvedantb's compact query matches, so reduced motion stays off.
    const matchMedia = window.matchMedia;
    window.matchMedia = (query) => {
      const list = matchMedia.call(window, query);
      if (!query.includes("max-width: 639px")) return list;
      Object.defineProperty(list, "matches", { value: true });
      return list;
    };
    try {
      await expectParity({
        name: "phone",
        legacy: dialogTree(LegacyDialog),
        next: dialogTree(Next),
        normalise: stripFooterSlot,
      });
      // Without eva's `viewportAware: false` the same tree is a bottom sheet.
      const { next } = await renderPair(dialogTree(LegacyDialog), dialogTree(Next), {});
      expect(next).toContain('data-compact="true"');
    } finally {
      window.matchMedia = matchMedia;
    }
  });
});

// ---------------------------------------------------------------------------
// Sheet → SideSheet (no apps/web call sites; eva exports it from @eva/ui)

describe("SideSheet (eva Sheet)", () => {
  const variants: { side?: "left" | "right"; hideCloseButton?: boolean; className?: string }[] = [
    {},
    { side: "left" },
    { side: "right" },
    { side: "right", hideCloseButton: true },
    { className: "w-72 p-4" },
  ];
  runCases(
    variants.map((v) => ({
      name: `open ${JSON.stringify(v)}`,
      legacy: (
        <LegacySheet.Sheet open>
          <LegacySheet.SheetContent {...v}>
            <LegacySheet.SheetTitle>Title</LegacySheet.SheetTitle>
            Body
          </LegacySheet.SheetContent>
        </LegacySheet.Sheet>
      ),
      next: (
        <Next.SideSheet open>
          <Next.SideSheetContent {...v}>
            <Next.SideSheetTitle>Title</Next.SideSheetTitle>
            Body
          </Next.SideSheetContent>
        </Next.SideSheet>
      ),
    })),
  );
  runCases([
    {
      name: "closed trigger",
      legacy: (
        <LegacySheet.Sheet>
          <LegacySheet.SheetTrigger>Menu</LegacySheet.SheetTrigger>
        </LegacySheet.Sheet>
      ),
      next: (
        <Next.SideSheet>
          <Next.SideSheetTrigger>Menu</Next.SideSheetTrigger>
        </Next.SideSheet>
      ),
    },
  ]);
});

// ---------------------------------------------------------------------------
// Popover (26 sites)

type PopoverProps = {
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  className?: string;
  "aria-label"?: string;
};

const popoverVariants: PopoverProps[] = [
  {},
  { align: "start", className: "w-64 p-0" },
  { align: "end", className: "w-auto p-0" },
  { align: "center", className: "w-80 p-2" },
  { align: "end", className: "w-72 space-y-3" },
  { align: "start", className: "w-fit overflow-hidden p-0" },
  { align: "end", className: "w-auto max-sm:overflow-x-auto p-0" },
  { side: "top", align: "end", sideOffset: 8, className: "w-[min(26rem,calc(100vw-2rem))] p-3", "aria-label": "Composer" },
  // ComposerStash: `rounded-b-none` is a per-side radius, which neither cn treats
  // as conflicting with `rounded-surface`, so both keep both classes.
  {
    side: "top",
    align: "center",
    sideOffset: 0,
    className: "w-[calc(var(--radix-popover-trigger-width)-1.5rem)] max-w-none rounded-b-none p-0",
  },
  { align: "start", sideOffset: 4, className: "w-[var(--radix-popover-trigger-width)] p-0" },
];

describe("Popover", () => {
  runCases(
    popoverVariants.map((v) => ({
      name: `open ${JSON.stringify(v)}`,
      legacy: (
        <LegacyPopover.Popover open>
          <LegacyPopover.PopoverTrigger asChild>
            <button type="button">Open</button>
          </LegacyPopover.PopoverTrigger>
          <LegacyPopover.PopoverContent {...v}>Body</LegacyPopover.PopoverContent>
        </LegacyPopover.Popover>
      ),
      next: (
        <Next.Popover open>
          <Next.PopoverTrigger asChild>
            <button type="button">Open</button>
          </Next.PopoverTrigger>
          <Next.PopoverContent {...v}>Body</Next.PopoverContent>
        </Next.Popover>
      ),
    })),
  );
  runCases([
    {
      name: "plain trigger, closed",
      legacy: (
        <LegacyPopover.Popover>
          <LegacyPopover.PopoverTrigger disabled>Open</LegacyPopover.PopoverTrigger>
        </LegacyPopover.Popover>
      ),
      next: (
        <Next.Popover>
          <Next.PopoverTrigger disabled>Open</Next.PopoverTrigger>
        </Next.Popover>
      ),
    },
    {
      name: "anchor asChild",
      legacy: (
        <LegacyPopover.Popover open>
          <LegacyPopover.PopoverAnchor asChild>
            <div>Anchor</div>
          </LegacyPopover.PopoverAnchor>
          <LegacyPopover.PopoverContent align="start">Body</LegacyPopover.PopoverContent>
        </LegacyPopover.Popover>
      ),
      next: (
        <Next.Popover open>
          <Next.PopoverAnchor asChild>
            <div>Anchor</div>
          </Next.PopoverAnchor>
          <Next.PopoverContent align="start">Body</Next.PopoverContent>
        </Next.Popover>
      ),
    },
  ]);
});

// ---------------------------------------------------------------------------
// HoverCard (10 sites)

const hoverCardVariants: PopoverProps[] = [
  {},
  { side: "right", align: "start", sideOffset: 8, className: "w-64 p-3" },
  { side: "top", align: "start", className: "w-auto border-0 bg-transparent p-0 shadow-none backdrop-blur-none" },
  { side: "bottom", align: "start", sideOffset: 6, className: "w-64 p-3" },
  { align: "start", className: "w-auto min-w-40 p-2" },
  { align: "end", className: "w-fit p-0" },
  { className: "min-w-60 divide-y overflow-hidden p-0" },
];

describe("HoverCard", () => {
  runCases(
    hoverCardVariants.map((v) => ({
      name: `open ${JSON.stringify(v)}`,
      legacy: (
        <LegacyHoverCard.HoverCard open>
          <LegacyHoverCard.HoverCardTrigger asChild>
            <a href="#x">Hover</a>
          </LegacyHoverCard.HoverCardTrigger>
          <LegacyHoverCard.HoverCardContent {...v}>Body</LegacyHoverCard.HoverCardContent>
        </LegacyHoverCard.HoverCard>
      ),
      next: (
        <Next.HoverCard open>
          <Next.HoverCardTrigger asChild>
            <a href="#x">Hover</a>
          </Next.HoverCardTrigger>
          <Next.HoverCardContent {...v}>Body</Next.HoverCardContent>
        </Next.HoverCard>
      ),
    })),
  );
});

// ---------------------------------------------------------------------------
// Tooltip (85 sites, plus MessageAction and friends in ai-elements)

const tooltipVariants: PopoverProps[] = [
  {},
  { side: "right" },
  { side: "left", className: "text-xs" },
  { side: "bottom" },
  { side: "top" },
  { className: "text-xs" },
  { side: "top", className: "max-w-[calc(100vw-2rem)] whitespace-pre-wrap sm:max-w-96" },
  { className: "sm:hidden" },
  { side: "top", className: "text-xs", sideOffset: 8 },
  { side: "right", className: "flex items-center gap-2" },
  { className: "max-w-64" },
];

describe("Tooltip", () => {
  runCases(
    tooltipVariants.map((v) => ({
      name: `open ${JSON.stringify(v)}`,
      legacy: (
        <LegacyTooltip.TooltipProvider>
          <LegacyTooltip.Tooltip open>
            <LegacyTooltip.TooltipTrigger asChild>
              <button type="button">Tip</button>
            </LegacyTooltip.TooltipTrigger>
            <LegacyTooltip.TooltipContent {...v}>Body</LegacyTooltip.TooltipContent>
          </LegacyTooltip.Tooltip>
        </LegacyTooltip.TooltipProvider>
      ),
      next: (
        <Next.TooltipProvider>
          <Next.Tooltip open>
            <Next.TooltipTrigger asChild>
              <button type="button">Tip</button>
            </Next.TooltipTrigger>
            <Next.TooltipContent {...v}>Body</Next.TooltipContent>
          </Next.Tooltip>
        </Next.TooltipProvider>
      ),
    })),
  );
});

// ---------------------------------------------------------------------------
// Open delays: TooltipProvider 300ms, HoverCard 250ms (Radix defaults are 700ms).

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mounts `node`, points at `[data-target]`, and reports whether content is open at each mark. */
async function openStates(node: ReactNode, event: "pointermove" | "pointerover", marks: number[]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  const target = document.querySelector("[data-target]");
  if (!target) throw new Error("missing target");
  await act(async () => {
    target.dispatchEvent(new PointerEvent(event, { bubbles: true, pointerType: "mouse" }));
  });
  const states: boolean[] = [];
  let elapsed = 0;
  for (const mark of marks) {
    await act(async () => wait(mark - elapsed));
    elapsed = mark;
    states.push(target.getAttribute("data-state")?.includes("open") ?? false);
  }
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  return states;
}

describe("open delays", () => {
  it("TooltipProvider waits 300ms", async () => {
    const legacy = await openStates(
      <LegacyTooltip.TooltipProvider>
        <LegacyTooltip.Tooltip>
          <LegacyTooltip.TooltipTrigger data-target="">Tip</LegacyTooltip.TooltipTrigger>
          <LegacyTooltip.TooltipContent>Body</LegacyTooltip.TooltipContent>
        </LegacyTooltip.Tooltip>
      </LegacyTooltip.TooltipProvider>,
      "pointermove",
      [150, 450],
    );
    const next = await openStates(
      <UiConfigProvider config={evaUiConfig}>
        <Next.TooltipProvider>
          <Next.Tooltip>
            <Next.TooltipTrigger data-target="">Tip</Next.TooltipTrigger>
            <Next.TooltipContent>Body</Next.TooltipContent>
          </Next.Tooltip>
        </Next.TooltipProvider>
      </UiConfigProvider>,
      "pointermove",
      [150, 450],
    );
    expect(legacy).toEqual([false, true]);
    expect(next).toEqual(legacy);
  });

  it("HoverCard waits 250ms", async () => {
    const legacy = await openStates(
      <LegacyHoverCard.HoverCard>
        <LegacyHoverCard.HoverCardTrigger data-target="">Hover</LegacyHoverCard.HoverCardTrigger>
        <LegacyHoverCard.HoverCardContent>Body</LegacyHoverCard.HoverCardContent>
      </LegacyHoverCard.HoverCard>,
      "pointerover",
      [150, 400],
    );
    const next = await openStates(
      <UiConfigProvider config={evaUiConfig}>
        <Next.HoverCard>
          <Next.HoverCardTrigger data-target="">Hover</Next.HoverCardTrigger>
          <Next.HoverCardContent>Body</Next.HoverCardContent>
        </Next.HoverCard>
      </UiConfigProvider>,
      "pointerover",
      [150, 400],
    );
    expect(legacy).toEqual([false, true]);
    expect(next).toEqual(legacy);
  });
});

// ---------------------------------------------------------------------------
// DropdownMenu (39 contents, 70 items, 18 subs, 23 radio, 8 checkbox)

type MenuContentProps = PopoverProps;

function dropdownTree(M: typeof LegacyDropdown | typeof Next, content: MenuContentProps, sub?: string) {
  return (
    <M.DropdownMenu open>
      <M.DropdownMenuTrigger asChild>
        <button type="button">Menu</button>
      </M.DropdownMenuTrigger>
      <M.DropdownMenuContent {...content}>
        <M.DropdownMenuLabel>Label</M.DropdownMenuLabel>
        <M.DropdownMenuLabel inset className="truncate text-xs text-muted-foreground">
          Inset
        </M.DropdownMenuLabel>
        <M.DropdownMenuGroup>
          <M.DropdownMenuItem>Item</M.DropdownMenuItem>
          <M.DropdownMenuItem inset>Inset</M.DropdownMenuItem>
          <M.DropdownMenuItem disabled className="m-1.5">
            Disabled
          </M.DropdownMenuItem>
          <M.DropdownMenuItem className="text-destructive focus:text-destructive">Delete</M.DropdownMenuItem>
          <M.DropdownMenuItem className="items-start py-2">Two line</M.DropdownMenuItem>
          <M.DropdownMenuItem asChild className="min-w-0 flex-1">
            <a href="#x">Link</a>
          </M.DropdownMenuItem>
          <M.DropdownMenuItem>
            Shortcut<M.DropdownMenuShortcut>⌘K</M.DropdownMenuShortcut>
          </M.DropdownMenuItem>
        </M.DropdownMenuGroup>
        <M.DropdownMenuSeparator />
        <M.DropdownMenuCheckboxItem checked>Checked</M.DropdownMenuCheckboxItem>
        <M.DropdownMenuCheckboxItem checked={false}>Unchecked</M.DropdownMenuCheckboxItem>
        <M.DropdownMenuSeparator className="my-1" />
        <M.DropdownMenuRadioGroup value="a">
          <M.DropdownMenuRadioItem value="a">A</M.DropdownMenuRadioItem>
          <M.DropdownMenuRadioItem value="b">B</M.DropdownMenuRadioItem>
        </M.DropdownMenuRadioGroup>
        <M.DropdownMenuSub open>
          <M.DropdownMenuSubTrigger>More</M.DropdownMenuSubTrigger>
          <M.DropdownMenuSubContent className={sub}>
            <M.DropdownMenuItem>Sub item</M.DropdownMenuItem>
          </M.DropdownMenuSubContent>
        </M.DropdownMenuSub>
      </M.DropdownMenuContent>
    </M.DropdownMenu>
  );
}

const dropdownVariants: { content: MenuContentProps; sub?: string }[] = [
  { content: {} },
  { content: { align: "end" } },
  { content: { align: "start", className: "w-52" }, sub: "max-h-72 w-72 overflow-y-auto" },
  { content: { align: "end", className: "max-h-80 w-56 overflow-y-auto" } },
  { content: { align: "start", className: "min-w-44" }, sub: "flex max-h-72 min-w-56 max-w-72 flex-col overflow-hidden p-0" },
  { content: { align: "end", side: "top", sideOffset: 8, className: "w-56" } },
  { content: { align: "start", className: "max-h-[70dvh] w-56 max-w-[calc(100vw-2rem)] overflow-y-auto" } },
];

describe("DropdownMenu", () => {
  runCases(
    dropdownVariants.map((v) => ({
      name: `open ${JSON.stringify(v)}`,
      legacy: dropdownTree(LegacyDropdown, v.content, v.sub),
      next: dropdownTree(Next, v.content, v.sub),
    })),
  );
  runCases([
    {
      name: "closed trigger",
      legacy: (
        <LegacyDropdown.DropdownMenu>
          <LegacyDropdown.DropdownMenuTrigger className="p-1">Menu</LegacyDropdown.DropdownMenuTrigger>
        </LegacyDropdown.DropdownMenu>
      ),
      next: (
        <Next.DropdownMenu>
          <Next.DropdownMenuTrigger className="p-1">Menu</Next.DropdownMenuTrigger>
        </Next.DropdownMenu>
      ),
    },
  ]);
});

// ---------------------------------------------------------------------------
// ContextMenu (18 contents, 30 items, 8 separators). Opened with a right click.

function contextTree(M: typeof LegacyContext | typeof Next, className?: string) {
  return (
    <M.ContextMenu>
      <M.ContextMenuTrigger asChild>
        <div data-ctx="">Area</div>
      </M.ContextMenuTrigger>
      <M.ContextMenuContent className={className}>
        <M.ContextMenuLabel>Label</M.ContextMenuLabel>
        <M.ContextMenuItem>Item</M.ContextMenuItem>
        <M.ContextMenuItem className="text-warning">Warn</M.ContextMenuItem>
        <M.ContextMenuItem disabled>Disabled</M.ContextMenuItem>
        <M.ContextMenuItem asChild>
          <a href="#x">Link</a>
        </M.ContextMenuItem>
        <M.ContextMenuItem>
          Copy<M.ContextMenuShortcut>⌘C</M.ContextMenuShortcut>
        </M.ContextMenuItem>
        <M.ContextMenuSeparator />
        <M.ContextMenuCheckboxItem checked>Checked</M.ContextMenuCheckboxItem>
        <M.ContextMenuRadioGroup value="a">
          <M.ContextMenuRadioItem value="a">A</M.ContextMenuRadioItem>
        </M.ContextMenuRadioGroup>
        <M.ContextMenuSub open>
          <M.ContextMenuSubTrigger inset>More</M.ContextMenuSubTrigger>
          <M.ContextMenuSubContent>
            <M.ContextMenuItem>Sub item</M.ContextMenuItem>
          </M.ContextMenuSubContent>
        </M.ContextMenuSub>
      </M.ContextMenuContent>
    </M.ContextMenu>
  );
}

const rightClick = () => {
  document
    .querySelector("[data-ctx]")
    ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
};

describe("ContextMenu", () => {
  runCases(
    [undefined, "w-56", "w-48"].map((className) => ({
      name: `open className=${String(className)}`,
      legacy: contextTree(LegacyContext, className),
      next: contextTree(Next, className),
      interact: rightClick,
    })),
  );
  runCases([
    {
      name: "closed",
      legacy: contextTree(LegacyContext),
      next: contextTree(Next),
    },
  ]);
  it("really opened", async () => {
    const { next } = await renderPair(contextTree(LegacyContext), contextTree(Next), evaUiConfig, rightClick);
    expect(next).toContain('role="menu"');
    expect(next).toContain("Sub item");
  });
});

// ---------------------------------------------------------------------------
// Select (15 sites)

/** `apps/web/src/lib/components/fields/FieldsSection.tsx` (7 SelectTrigger sites). */
const FIELD_TRIGGER_CLASS =
  "h-10 border-0 shadow-none bg-transparent px-2 focus:ring-0 focus:ring-offset-0 hover:bg-muted/60 rounded-lg text-sm [&>svg:last-child]:hidden";

function selectTree(
  S: typeof LegacySelect | typeof Next,
  props: { open?: boolean; trigger?: string; disabled?: boolean; id?: string; ariaLabel?: string },
) {
  return (
    <S.Select open={props.open} defaultValue="a" disabled={props.disabled}>
      <S.SelectTrigger className={props.trigger} id={props.id} aria-label={props.ariaLabel}>
        <S.SelectValue placeholder="Pick" />
      </S.SelectTrigger>
      <S.SelectContent>
        <S.SelectGroup>
          <S.SelectLabel>Group</S.SelectLabel>
          <S.SelectItem value="a">A</S.SelectItem>
          <S.SelectItem value="b" disabled>
            B
          </S.SelectItem>
        </S.SelectGroup>
        <S.SelectSeparator />
        <S.SelectItem value="c" data-pii="">
          C
        </S.SelectItem>
      </S.SelectContent>
    </S.Select>
  );
}

describe("Select", () => {
  runCases([
    { name: "closed", legacy: selectTree(LegacySelect, {}), next: selectTree(Next, {}) },
    { name: "closed disabled", legacy: selectTree(LegacySelect, { disabled: true }), next: selectTree(Next, { disabled: true }) },
    { name: "open", legacy: selectTree(LegacySelect, { open: true }), next: selectTree(Next, { open: true }) },
    {
      name: "open with id",
      legacy: selectTree(LegacySelect, { open: true, id: "event" }),
      next: selectTree(Next, { open: true, id: "event" }),
    },
    {
      name: "trigger h-8 w-40 px-2 text-xs",
      legacy: selectTree(LegacySelect, { trigger: "h-8 w-40 px-2 text-xs", ariaLabel: "Preview device" }),
      next: selectTree(Next, { trigger: "h-8 w-40 px-2 text-xs", ariaLabel: "Preview device" }),
    },
    {
      name: "trigger h-10 w-[100px] border-0 bg-secondary text-xs sm:h-7",
      legacy: selectTree(LegacySelect, { trigger: "h-10 w-[100px] border-0 bg-secondary text-xs sm:h-7" }),
      next: selectTree(Next, { trigger: "h-10 w-[100px] border-0 bg-secondary text-xs sm:h-7" }),
    },
    {
      name: "trigger PromptInputSelectTrigger classes",
      legacy: selectTree(LegacySelect, {
        trigger:
          "border-none bg-transparent font-medium text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
      }),
      next: selectTree(Next, {
        trigger:
          "border-none bg-transparent font-medium text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
      }),
    },
    // eva's cn does not treat `rounded-control` as a radius, so both keep it
    // beside the call site's `rounded-lg` (vvedantb merges with `UiConfig.cn`).
    {
      name: "trigger FIELD_TRIGGER_CLASS",
      legacy: selectTree(LegacySelect, { trigger: FIELD_TRIGGER_CLASS, open: true }),
      next: selectTree(Next, { trigger: FIELD_TRIGGER_CLASS, open: true }),
    },
  ]);
});

// ---------------------------------------------------------------------------
// Command (12 roots, 18 items, 10 empties)

function commandTree(
  C: typeof LegacyCommand | typeof Next,
  props: { root?: string; list?: string; empty?: string; item?: string; shortcut?: string; withItems?: boolean },
) {
  return (
    <C.Command className={props.root}>
      <C.CommandInput placeholder="Search" />
      <C.CommandList className={props.list}>
        {/* Only set the key when given: eva's spread let `className={undefined}` wipe the classes. */}
        <C.CommandEmpty {...(props.empty === undefined ? {} : { className: props.empty })}>Nothing</C.CommandEmpty>
        {props.withItems === false ? null : (
          <>
            <C.CommandGroup heading="Group">
              <C.CommandItem className={props.item}>
                Item<C.CommandShortcut className={props.shortcut}>⌘K</C.CommandShortcut>
              </C.CommandItem>
              <C.CommandItem disabled>Disabled</C.CommandItem>
            </C.CommandGroup>
            <C.CommandSeparator />
            <C.CommandGroup>
              <C.CommandItem>Other</C.CommandItem>
            </C.CommandGroup>
          </>
        )}
      </C.CommandList>
    </C.Command>
  );
}

const commandVariants: Parameters<typeof commandTree>[1][] = [
  {},
  { root: "border-0" },
  { root: "border-0 bg-transparent backdrop-blur-none" },
  { root: "flex h-full min-h-0 flex-col border-0", list: "min-h-0 flex-1 max-h-none" },
  { root: "border-0 outline-hidden", list: "max-h-[min(26rem,65dvh)]" },
  { list: "max-h-72 p-1", item: "gap-2" },
  { item: "group flex cursor-pointer items-center gap-2 text-xs aria-selected:bg-muted" },
  { shortcut: "max-w-[55%] truncate normal-case tracking-normal" },
  // ModelPickerContent: `rounded-none` beside the config's `rounded-surface`.
  { root: "flex min-w-0 flex-1 flex-col rounded-none border-0 bg-muted/40" },
  // CommandEmpty: eva let a className replace the classes (see `emptyClassNameReplaces`).
  { withItems: false },
  { withItems: false, empty: "px-4 text-muted-foreground" },
  { withItems: false, empty: "px-3 py-6 text-center text-sm text-muted-foreground" },
  { withItems: false, empty: "flex h-full min-h-48 items-center justify-center py-0" },
  // PromptInputCommandEmpty passes `cn(undefined)`, an empty string.
  { withItems: false, empty: "" },
];

describe("Command", () => {
  runCases(
    commandVariants.map((v, i) => ({
      name: `#${i} ${JSON.stringify(v)}`,
      legacy: commandTree(LegacyCommand, v),
      next: commandTree(Next, v),
    })),
  );

  /**
   * ModelPickerContent (`ai-elements/model-picker-content.tsx`) passes
   * `rounded-none`. eva's cn keeps `rounded-surface` beside it, and eva's CSS
   * emits `rounded-surface` after `rounded-none`, so the panel stays rounded.
   * vvedantb merges with eva's cn (`UiConfig.cn`), so it keeps it too.
   */
  it("rounded-none on the root keeps rounded-surface (ModelPickerContent)", async () => {
    const { legacy, next } = await expectParity({
      name: "ModelPickerContent root",
      legacy: <LegacyCommand.Command className="rounded-none">x</LegacyCommand.Command>,
      next: <Next.Command className="rounded-none">x</Next.Command>,
    });
    expect(legacy).toContain("rounded-none rounded-surface");
    expect(next).toContain("rounded-surface");
  });

  runCases([
    {
      name: "CommandDialog open",
      legacy: (
        <LegacyCommand.CommandDialog open>
          <LegacyCommand.CommandInput placeholder="Search" />
          <LegacyCommand.CommandList>
            <LegacyCommand.CommandItem>Item</LegacyCommand.CommandItem>
          </LegacyCommand.CommandList>
        </LegacyCommand.CommandDialog>
      ),
      next: (
        <Next.CommandDialog open>
          <Next.CommandInput placeholder="Search" />
          <Next.CommandList>
            <Next.CommandItem>Item</Next.CommandItem>
          </Next.CommandList>
        </Next.CommandDialog>
      ),
    },
  ]);
});

// ---------------------------------------------------------------------------
// Menu motion (was `ui/menuMotion.test.ts`, which reads the legacy files).

describe("menu content motion", () => {
  const classes = menuContentClass("origin-test");

  it("animates in both directions, scaling and fading", () => {
    expect(classes).toContain("data-[state=open]:animate-in");
    expect(classes).toContain("data-[state=closed]:animate-out");
    expect(classes).toMatch(/data-\[state=open\]:zoom-in-\d+/);
    expect(classes).toMatch(/data-\[state=closed\]:zoom-out-\d+/);
    expect(classes).toMatch(/data-\[state=open\]:fade-in-\d+/);
    expect(classes).toMatch(/data-\[state=closed\]:fade-out-\d+/);
  });

  /** The asymmetry *is* the fix — a symmetric exit is what got the motion cut. */
  it("leaves faster than it arrives", () => {
    const enterMs = Number(/(?:^| )duration-(\d+)/.exec(classes)?.[1]);
    const exitMs = Number(/data-\[state=closed\]:duration-(\d+)/.exec(classes)?.[1]);
    expect(enterMs).toBeGreaterThan(0);
    expect(exitMs).toBeGreaterThan(0);
    expect(exitMs).toBeLessThan(enterMs);
  });

  it("each menu scales from its own Radix origin var", () => {
    expect(evaUiConfig.DropdownMenu.classes.content).toContain(
      "origin-(--radix-dropdown-menu-content-transform-origin)",
    );
    expect(evaUiConfig.ContextMenu.classes.content).toContain(
      "origin-(--radix-context-menu-content-transform-origin)",
    );
  });
});

import {
  Button,
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@vvedantb/ui";
import {
  IconCopy,
  IconDots,
  IconLogout,
  IconPencil,
  IconShare,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { GalleryGroup, GalleryItem } from "./GalleryItem";

const noop = () => {};

export function DropdownMenuSection() {
  return (
    <GalleryGroup title="DropdownMenu (open, sub-menu open)">
      <GalleryItem label="All item kinds">
        <DropdownMenu open onOpenChange={noop}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <IconDots />
              Options
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>My account</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <IconUser />
                Profile
                <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconPencil />
                Rename
                <DropdownMenuShortcut>F2</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <IconCopy />
                Duplicate (disabled)
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked>
              Show sidebar
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={false}>
              Show minimap
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel inset>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value="dark">
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuSub open onOpenChange={noop}>
              <DropdownMenuSubTrigger>
                <IconShare />
                Share
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>Copy link</DropdownMenuItem>
                <DropdownMenuItem>Email</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem inset>Inset item</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              <IconLogout />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </GalleryItem>
    </GalleryGroup>
  );
}

/**
 * Radix ContextMenu has no `open` prop: it opens on a `contextmenu` event at
 * the pointer. A synthetic event at the trigger's fixed offset opens it at a
 * stable spot on load.
 */
function openContextMenuOnMount(node: HTMLSpanElement | null) {
  if (!node) return;
  requestAnimationFrame(() => {
    const box = node.getBoundingClientRect();
    node.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: box.left + 24,
        clientY: box.top + 24,
      }),
    );
  });
}

export function ContextMenuSection() {
  return (
    <GalleryGroup title="ContextMenu (opened by a synthetic right-click, sub-menu open)">
      <GalleryItem label="ContextMenuTrigger area">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <span
              ref={openContextMenuOnMount}
              className="flex h-40 w-72 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
            >
              Right-click here
            </span>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-60">
            <ContextMenuLabel>File</ContextMenuLabel>
            <ContextMenuGroup>
              <ContextMenuItem>
                <IconPencil />
                Rename
                <ContextMenuShortcut>F2</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem disabled>
                <IconCopy />
                Duplicate (disabled)
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuCheckboxItem checked>Pinned</ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem checked={false}>
              Muted
            </ContextMenuCheckboxItem>
            <ContextMenuSeparator />
            <ContextMenuLabel inset>Sort by</ContextMenuLabel>
            <ContextMenuRadioGroup value="name">
              <ContextMenuRadioItem value="name">Name</ContextMenuRadioItem>
              <ContextMenuRadioItem value="date">Date</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
            <ContextMenuSeparator />
            <ContextMenuSub open onOpenChange={noop}>
              <ContextMenuSubTrigger>
                <IconShare />
                Share
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem>Copy link</ContextMenuItem>
                <ContextMenuItem>Email</ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuItem inset>Inset item</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem className="text-destructive">
              <IconTrash />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </GalleryItem>
    </GalleryGroup>
  );
}

export function SelectSection() {
  return (
    <GalleryGroup title="Select (closed + open)" className="gap-16">
      <GalleryItem label="SelectTrigger closed, placeholder" className="w-56">
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Pick a region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="iad">us-east</SelectItem>
          </SelectContent>
        </Select>
      </GalleryItem>
      <GalleryItem label="SelectTrigger disabled" className="w-56">
        <Select disabled value="iad">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="iad">us-east</SelectItem>
          </SelectContent>
        </Select>
      </GalleryItem>
      <GalleryItem
        label="Open with groups, label, separator, disabled item"
        className="w-56"
      >
        <Select open onOpenChange={noop} value="sfo">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Americas</SelectLabel>
              <SelectItem value="iad">us-east</SelectItem>
              <SelectItem value="sfo">us-west</SelectItem>
              <SelectItem value="gru" disabled>
                sa-east (disabled)
              </SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Europe</SelectLabel>
              <SelectItem value="fra">eu-central</SelectItem>
              <SelectItem value="lhr">eu-west</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </GalleryItem>
    </GalleryGroup>
  );
}

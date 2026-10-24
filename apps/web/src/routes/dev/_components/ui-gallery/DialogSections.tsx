import type { SyntheticEvent } from "react";
import {
  Button,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@eva/ui";
import {
  IconFile,
  IconGitBranch,
  IconHome,
  IconSettings,
  IconUser,
} from "@tabler/icons-react";
import { GalleryGroup, GalleryItem } from "./GalleryItem";

const noop = () => {};
/** Keeps focus (and its ring / caret) out of overlays rendered open on load. */
const skipAutoFocus = (event: Event | SyntheticEvent) => event.preventDefault();

export function DialogSection() {
  return (
    <GalleryGroup title="Dialog (open, controlled)">
      <GalleryItem label="DialogTrigger + DialogContent with header, body, footer">
        <Dialog open onOpenChange={noop}>
          <DialogTrigger asChild>
            <Button variant="outline">Edit profile</Button>
          </DialogTrigger>
          <DialogContent onOpenAutoFocus={skipAutoFocus}>
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
              <DialogDescription>
                Change your name and email. Save when you are done.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="g-dialog-name">Name</Label>
                  <Input id="g-dialog-name" defaultValue="Vedant" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="g-dialog-email">Email</Label>
                  <Input id="g-dialog-email" defaultValue="vedant@eva.dev" />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button>Save changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </GalleryItem>
    </GalleryGroup>
  );
}

export function SheetSection() {
  return (
    <GalleryGroup title="Sheet (left + right open, controlled)">
      <GalleryItem label="SheetTrigger + SheetContent side=left">
        <Sheet open onOpenChange={noop}>
          <SheetTrigger asChild>
            <Button variant="outline">Open left</Button>
          </SheetTrigger>
          <SheetContent className="w-80 p-6" onOpenAutoFocus={skipAutoFocus}>
            <SheetTitle className="text-base font-semibold">Navigation</SheetTitle>
            <nav className="mt-4 flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-2 rounded-lg bg-muted px-2 py-1.5">
                <IconHome className="size-4" /> Home
              </span>
              <span className="flex items-center gap-2 px-2 py-1.5">
                <IconGitBranch className="size-4" /> Branches
              </span>
              <span className="flex items-center gap-2 px-2 py-1.5">
                <IconSettings className="size-4" /> Settings
              </span>
            </nav>
          </SheetContent>
        </Sheet>
      </GalleryItem>
      <GalleryItem label="SheetContent side=right with SheetClose (modal=false)">
        {/* Non-modal so it renders no second scrim over the left sheet; the
            left sheet's scrim already shows the overlay styling. */}
        <Sheet open onOpenChange={noop} modal={false}>
          <SheetTrigger asChild>
            <Button variant="outline">Open right</Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-96 p-6"
            onOpenAutoFocus={skipAutoFocus}
          >
            <SheetTitle className="text-base font-semibold">Details</SheetTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Run 1042 finished in 3m 12s.
            </p>
            <SheetClose asChild>
              <Button className="mt-6" variant="secondary">
                Done
              </Button>
            </SheetClose>
          </SheetContent>
        </Sheet>
      </GalleryItem>
    </GalleryGroup>
  );
}

function CommandItems() {
  return (
    <>
      <CommandInput placeholder="Type a command or search" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem value="home">
            <IconHome />
            Home
            <CommandShortcut>G H</CommandShortcut>
          </CommandItem>
          <CommandItem value="files">
            <IconFile />
            Search files
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem value="disabled" disabled>
            <IconGitBranch />
            Switch branch (disabled)
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem value="profile">
            <IconUser />
            Profile
            <CommandShortcut>⌘,</CommandShortcut>
          </CommandItem>
          <CommandItem value="settings">
            <IconSettings />
            Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </>
  );
}

export function CommandSection() {
  return (
    <GalleryGroup title="Command (inline) + CommandDialog (open)">
      <GalleryItem label="Command inline" className="w-80">
        <Command className="border border-border">
          <CommandItems />
        </Command>
      </GalleryItem>
      <CommandDialog open onOpenChange={noop}>
        <CommandItems />
      </CommandDialog>
    </GalleryGroup>
  );
}

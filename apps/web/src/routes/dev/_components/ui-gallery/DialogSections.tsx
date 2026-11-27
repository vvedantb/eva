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
} from "@vvedantb/ui";
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

import { useEffect } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  BorderBeam,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CenteredSpinner,
  Spinner,
  CrossfadeIcon,
  CrossfadeIconSlot,
  Label,
  ListRow,
  LoadingState,
  Progress,
  RefreshSpinIcon,
  Separator,
  StatusDot,
  Surface,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SonnerToaster,
  Button,
  toast,
} from "@vvedantb/ui";
import type { StatusTone } from "@vvedantb/ui";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useThemeMode } from "@/lib/hooks/useThemeMode";
import { GalleryGroup, GalleryItem } from "./GalleryItem";

const STATUS_TONES: StatusTone[] = [
  "progress",
  "business-review",
  "code-review",
  "done",
  "cancelled",
  "active",
  "critical",
  "neutral",
];

/** 1x1 grey PNG so AvatarImage loads without the network. */
const AVATAR_SRC =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

const GALLERY_TOASTER = "ui-gallery";

/** Shows a fixed set of toasts once. Fixed ids make the StrictMode re-run a no-op. */
function useGalleryToasts() {
  useEffect(() => {
    const options = { toasterId: GALLERY_TOASTER, duration: Infinity };
    toast("Default toast", { ...options, id: "g-default" });
    toast.success("Changes saved", {
      ...options,
      id: "g-success",
      description: "Your settings were updated.",
    });
    toast.warning("Sandbox is low on disk", { ...options, id: "g-warning" });
    toast.error("Build failed", {
      ...options,
      id: "g-error",
      description: "Exit code 2",
      action: { label: "Retry", onClick: () => {} },
    });
    toast.info("Deploy queued", {
      ...options,
      id: "g-info",
      cancel: { label: "Undo", onClick: () => {} },
    });
  }, []);
}

export function FeedbackSection() {
  const { resolvedTheme } = useThemeMode();
  useGalleryToasts();
  return (
    // Capped width keeps the specimens clear of the fixed top-right toasts.
    <div className="flex max-w-[960px] flex-col gap-10">
      <SpinnerGroup />
      <GalleryGroup title="StatusDot">
        {STATUS_TONES.map((tone) => (
          <GalleryItem key={tone} label={tone}>
            <div className="flex items-center gap-2">
              <StatusDot tone={tone} />
              <StatusDot tone={tone} size="md" />
            </div>
          </GalleryItem>
        ))}
      </GalleryGroup>
      <SurfaceGroup />
      <GalleryGroup title="Avatar / Progress / Separator / Label">
        <GalleryItem label="Avatar image + fallback">
          <div className="flex gap-2">
            <Avatar>
              <AvatarImage src={AVATAR_SRC} alt="Grey" />
              <AvatarFallback>GR</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>VB</AvatarFallback>
            </Avatar>
          </div>
        </GalleryItem>
        <GalleryItem label="Progress 0 / 40 / 100" className="w-60">
          <div className="flex flex-col gap-2">
            <Progress value={0} />
            <Progress value={40} />
            <Progress value={100} />
          </div>
        </GalleryItem>
        <GalleryItem label="Separator h + v" className="w-60">
          <div className="flex h-10 items-center gap-3">
            <span className="text-sm">Left</span>
            <Separator orientation="vertical" />
            <span className="text-sm">Right</span>
          </div>
          <Separator />
        </GalleryItem>
        <GalleryItem label="Label">
          <Label htmlFor="g-label-input">Email address</Label>
        </GalleryItem>
      </GalleryGroup>
      <CardTableGroup />
      <GalleryGroup title="Toaster (fixed, top-right)">
        <GalleryItem label="Toaster id=ui-gallery, expand">
          <span className="text-sm text-muted-foreground">
            Five toasts render in the top-right corner.
          </span>
        </GalleryItem>
      </GalleryGroup>
      <SonnerToaster
        id={GALLERY_TOASTER}
        theme={resolvedTheme}
        position="top-right"
        visibleToasts={5}
        expand
      />
    </div>
  );
}

function SpinnerGroup() {
  return (
    <GalleryGroup title="Spinners / loading (continuous animation)">
      <GalleryItem label="Spinner sm / md / lg">
        <div className="flex items-center gap-3">
          <Spinner size="sm" />
          <Spinner />
          <Spinner size="lg" />
        </div>
      </GalleryItem>
      <GalleryItem label="Spinner sm / md / lg">
        <div className="flex items-center gap-3">
          <Spinner variant="circle" size="sm" />
          <Spinner variant="circle" />
          <Spinner variant="circle" size="lg" />
        </div>
      </GalleryItem>
      <GalleryItem label="CenteredSpinner" className="w-48">
        <Surface density="none" className="h-24">
          <CenteredSpinner label="Loading" />
        </Surface>
      </GalleryItem>
      <GalleryItem label="LoadingState iconOnly Drive / Dots / Orbit, sm">
        <div className="flex items-center gap-4">
          <LoadingState iconOnly variant="Drive" />
          <LoadingState iconOnly variant="Dots" />
          <LoadingState iconOnly variant="Orbit" />
          <LoadingState iconOnly variant="Drive" size="sm" />
        </div>
      </GalleryItem>
      <GalleryItem label="RefreshSpinIcon idle / busy">
        <div className="flex items-center gap-3">
          <RefreshSpinIcon busy={false} />
          <RefreshSpinIcon busy />
        </div>
      </GalleryItem>
      <GalleryItem label="CrossfadeIcon false / true, Slot">
        <div className="flex items-center gap-3">
          <CrossfadeIcon
            show={false}
            whenTrue={<IconCheck className="size-4" />}
            whenFalse={<IconCopy className="size-4" />}
          />
          <CrossfadeIcon
            show
            variant="soft"
            whenTrue={<IconCheck className="size-4" />}
            whenFalse={<IconCopy className="size-4" />}
          />
          <CrossfadeIconSlot iconKey="copy">
            <IconCopy className="size-4" />
          </CrossfadeIconSlot>
        </div>
      </GalleryItem>
      <GalleryItem label="BorderBeam mono md / progress sm / colorful lg / off">
        <div className="flex items-center gap-4">
          <BorderBeam active className="rounded-lg">
            <div className="rounded-lg bg-card px-4 py-3 text-sm">mono</div>
          </BorderBeam>
          <BorderBeam
            active
            size="sm"
            colorVariant="progress"
            className="rounded-lg"
          >
            <div className="rounded-lg bg-card px-4 py-3 text-sm">progress</div>
          </BorderBeam>
          <BorderBeam
            active
            size="lg"
            colorVariant="colorful"
            className="rounded-lg"
          >
            <div className="rounded-lg bg-card px-4 py-3 text-sm">colorful</div>
          </BorderBeam>
          <BorderBeam active={false} className="rounded-lg">
            <div className="rounded-lg bg-card px-4 py-3 text-sm">inactive</div>
          </BorderBeam>
        </div>
      </GalleryItem>
    </GalleryGroup>
  );
}

function SurfaceGroup() {
  return (
    <GalleryGroup title="Surface / ListRow">
      {(["tight", "default", "comfortable", "none"] as const).map((density) => (
        <GalleryItem key={density} label={`Surface ${density}`}>
          <Surface density={density}>
            <span className="text-sm">Surface {density}</span>
          </Surface>
        </GalleryItem>
      ))}
      <GalleryItem
        label="ListRow plain / accent / selected / href"
        className="w-96"
      >
        <div className="flex flex-col gap-2">
          <ListRow>
            <span className="text-sm">Plain row</span>
          </ListRow>
          <ListRow accentClassName="bg-status-progress-bar">
            <span className="text-sm">Row with progress accent</span>
          </ListRow>
          <ListRow selected accentClassName="bg-status-done-bar">
            <span className="text-sm">Selected row</span>
          </ListRow>
          <ListRow href="#row" aria-label="Open row" onClick={() => {}}>
            <span className="text-sm">Interactive row (href)</span>
          </ListRow>
        </div>
      </GalleryItem>
    </GalleryGroup>
  );
}

function CardTableGroup() {
  return (
    <GalleryGroup title="Card / Table">
      <GalleryItem label="Card (all parts)" className="w-96">
        <Card>
          <CardHeader>
            <CardTitle>Project settings</CardTitle>
            <CardDescription>Manage how this project builds.</CardDescription>
            <CardAction>
              <Button size="sm" variant="outline">
                Edit
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Builds run on every push to main.</p>
          </CardContent>
          <CardFooter>
            <Button size="sm">Save</Button>
          </CardFooter>
        </Card>
      </GalleryItem>
      <GalleryItem label="Table" className="w-[480px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>build</TableCell>
              <TableCell>Passed</TableCell>
              <TableCell className="text-right">1m 12s</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>lint</TableCell>
              <TableCell>Failed</TableCell>
              <TableCell className="text-right">24s</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>test</TableCell>
              <TableCell>Running</TableCell>
              <TableCell className="text-right">-</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </GalleryItem>
    </GalleryGroup>
  );
}

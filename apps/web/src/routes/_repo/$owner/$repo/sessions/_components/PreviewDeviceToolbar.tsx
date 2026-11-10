"use client";

import { useState } from "react";
import { cn } from "@eva/ui";
import {
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  WebPreviewNavigationButton,
} from "@vvedantb/ui";
import {
  IconLink,
  IconLinkOff,
  IconRotateClockwise,
  IconX,
} from "@tabler/icons-react";
import {
  findPreviewViewportPreset,
  PREVIEW_VIEWPORT_MAX,
  PREVIEW_VIEWPORT_MAX_AREA,
  PREVIEW_VIEWPORT_MIN,
  PREVIEW_VIEWPORT_PRESETS,
  presetViewport,
  resizePreviewViewport,
  rotatePreviewViewport,
  type PreviewViewportPresetId,
  type SizedPreviewViewport,
} from "../_utils/previewViewport";

const RESPONSIVE_VALUE = "responsive";

function isPresetId(value: string): value is PreviewViewportPresetId {
  return findPreviewViewportPreset(value) !== undefined;
}

export function PreviewDeviceToolbar({
  viewport,
  aspectRatio,
  onAspectRatioChange,
  onChange,
  onFill,
}: {
  viewport: SizedPreviewViewport;
  aspectRatio: number | null;
  onAspectRatioChange: (aspectRatio: number | null) => void;
  onChange: (viewport: SizedPreviewViewport) => void;
  onFill: () => void;
}) {
  const [draft, setDraft] = useState<{
    width: string;
    height: string;
  } | null>(null);
  const presented = draft ?? {
    width: String(viewport.width),
    height: String(viewport.height),
  };
  const selectedValue =
    viewport.mode === "preset" && isPresetId(viewport.id)
      ? viewport.id
      : RESPONSIVE_VALUE;
  const customWidth = Number(presented.width);
  const customHeight = Number(presented.height);
  const customValid =
    Number.isInteger(customWidth) &&
    Number.isInteger(customHeight) &&
    customWidth >= PREVIEW_VIEWPORT_MIN &&
    customWidth <= PREVIEW_VIEWPORT_MAX &&
    customHeight >= PREVIEW_VIEWPORT_MIN &&
    customHeight <= PREVIEW_VIEWPORT_MAX &&
    customWidth * customHeight <= PREVIEW_VIEWPORT_MAX_AREA;

  function apply(next: SizedPreviewViewport, nextAspect = aspectRatio) {
    onChange(next);
    onAspectRatioChange(nextAspect);
    setDraft(null);
  }

  function commitDraft() {
    if (
      !customValid ||
      (customWidth === viewport.width && customHeight === viewport.height)
    ) {
      setDraft(null);
      return;
    }
    apply({ mode: "freeform", width: customWidth, height: customHeight });
  }

  function updateDraft(axis: "width" | "height", value: string) {
    setDraft((current) => {
      const next = {
        width:
          axis === "width" ? value : (current?.width ?? String(viewport.width)),
        height:
          axis === "height"
            ? value
            : (current?.height ?? String(viewport.height)),
      };
      const numeric = Number(value);
      if (
        aspectRatio === null ||
        !Number.isInteger(numeric) ||
        numeric < PREVIEW_VIEWPORT_MIN ||
        numeric > PREVIEW_VIEWPORT_MAX
      ) {
        return next;
      }
      const resized = resizePreviewViewport(
        viewport,
        axis === "width"
          ? { x: numeric - viewport.width, y: 0 }
          : { x: 0, y: numeric - viewport.height },
        axis === "width" ? "east" : "south",
        aspectRatio,
      );
      return { width: String(resized.width), height: String(resized.height) };
    });
  }

  function selectViewport(value: string) {
    if (value === RESPONSIVE_VALUE) {
      if (viewport.mode === "freeform") return;
      apply({
        mode: "freeform",
        width: viewport.width,
        height: viewport.height,
      });
      return;
    }
    if (!isPresetId(value)) return;
    const preset = findPreviewViewportPreset(value);
    if (!preset) return;
    apply(
      presetViewport(value),
      aspectRatio === null ? null : preset.width / preset.height,
    );
  }

  const phones = PREVIEW_VIEWPORT_PRESETS.filter((p) => p.category === "Phone");
  const tablets = PREVIEW_VIEWPORT_PRESETS.filter(
    (p) => p.category === "Tablet",
  );

  return (
    <div
      className="flex flex-wrap items-center gap-1 bg-muted px-2 py-1"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        commitDraft();
      }}
    >
      <Select value={selectedValue} onValueChange={selectViewport}>
        <SelectTrigger
          className="h-8 w-40 px-2 text-xs"
          aria-label="Preview device"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={RESPONSIVE_VALUE}>Responsive</SelectItem>
          <SelectGroup>
            <SelectLabel>Phone</SelectLabel>
            {phones.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Tablet</SelectLabel>
            {tablets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Input
        type="number"
        inputMode="numeric"
        value={presented.width}
        onChange={(event) => updateDraft("width", event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDraft();
          }
        }}
        aria-label="Viewport width"
        aria-invalid={!customValid}
        className={cn(
          "h-8 w-14 px-1 text-center text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
          !customValid && "border-destructive",
        )}
      />
      <span className="text-xs text-muted-foreground">×</span>
      <Input
        type="number"
        inputMode="numeric"
        value={presented.height}
        onChange={(event) => updateDraft("height", event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDraft();
          }
        }}
        aria-label="Viewport height"
        aria-invalid={!customValid}
        className={cn(
          "h-8 w-14 px-1 text-center text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
          !customValid && "border-destructive",
        )}
      />
      <WebPreviewNavigationButton
        tooltip={
          aspectRatio === null ? "Lock aspect ratio" : "Unlock aspect ratio"
        }
        aria-pressed={aspectRatio !== null}
        className={cn(
          "max-sm:hit-target",
          aspectRatio !== null &&
            "bg-secondary text-primary hover:text-primary",
        )}
        onClick={() => {
          if (aspectRatio !== null) {
            onAspectRatioChange(null);
            return;
          }
          if (!customValid) return;
          onAspectRatioChange(customWidth / customHeight);
        }}
      >
        {aspectRatio === null ? (
          <IconLinkOff className="h-3.5 w-3.5" />
        ) : (
          <IconLink className="h-3.5 w-3.5" />
        )}
      </WebPreviewNavigationButton>
      <WebPreviewNavigationButton
        tooltip="Rotate"
        className="max-sm:hit-target"
        onClick={() =>
          apply(
            rotatePreviewViewport(
              customValid &&
                (customWidth !== viewport.width ||
                  customHeight !== viewport.height)
                ? { mode: "freeform", width: customWidth, height: customHeight }
                : viewport,
            ),
            aspectRatio === null ? null : 1 / aspectRatio,
          )
        }
      >
        <IconRotateClockwise className="h-3.5 w-3.5" />
      </WebPreviewNavigationButton>
      <WebPreviewNavigationButton
        tooltip="Fill panel"
        className="max-sm:hit-target"
        onClick={onFill}
      >
        <IconX className="h-3.5 w-3.5" />
      </WebPreviewNavigationButton>
    </div>
  );
}

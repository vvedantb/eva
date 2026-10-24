"use client";

import {
  MediaControlBar,
  MediaController,
  MediaFullscreenButton,
  MediaMuteButton,
  MediaPlayButton,
  MediaPlaybackRateButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react";
import type { ComponentProps } from "react";
import { cn } from "../utils/cn";

// The control bar carries the dark backdrop (set via Tailwind on the bar),
// so individual controls stay transparent and hover applies a subtle light
// overlay on top — that reads as a "dimmer highlight" rather than going
// transparent against the chat bubble behind.
// Tooltip background is set explicitly because the default falls through
// to --media-secondary-color, which is transparent here.
const variables: Record<string, string> = {
  "--media-primary-color": "rgb(255 255 255 / 0.96)",
  "--media-secondary-color": "transparent",
  "--media-text-color": "rgb(255 255 255 / 0.92)",
  "--media-background-color": "rgb(9 9 11 / 1)",
  "--media-control-background": "transparent",
  "--media-control-hover-background": "rgb(255 255 255 / 0.14)",
  "--media-font-family": "var(--font-sans)",
  "--media-live-button-icon-color": "rgb(255 255 255 / 0.78)",
  "--media-live-button-indicator-color": "rgb(244 63 94)",
  "--media-range-track-background": "rgb(255 255 255 / 0.22)",
  "--media-range-thumb-background": "rgb(255 255 255 / 0.95)",
  "--media-tooltip-background-color": "rgb(24 24 27 / 0.98)",
  "--media-tooltip-arrow-color": "rgb(24 24 27 / 0.98)",
  "--media-tooltip-filter":
    "drop-shadow(0 6px 16px rgb(0 0 0 / 0.55)) drop-shadow(0 1px 2px rgb(0 0 0 / 0.4))",
  "--media-tooltip-distance": "10px",
  "--media-tooltip-border-radius": "6px",
};

export type VideoPlayerProps = ComponentProps<typeof MediaController>;

export const VideoPlayer = ({
  style,
  className,
  ...props
}: VideoPlayerProps) => (
  <MediaController
    className={cn(
      "overflow-hidden rounded-surface smooth-shadow-ring-lg shadow-black/20",
      className,
    )}
    style={{
      ...variables,
      ...style,
    }}
    {...props}
  />
);

export type VideoPlayerControlBarProps = ComponentProps<typeof MediaControlBar>;

export const VideoPlayerControlBar = ({
  className,
  ...props
}: VideoPlayerControlBarProps) => (
  <MediaControlBar
    className={cn(
      "bg-zinc-950/95 px-1 *:transition-colors *:duration-[var(--motion-fast)]",
      className,
    )}
    {...props}
  />
);

export type VideoPlayerTimeRangeProps = ComponentProps<typeof MediaTimeRange>;

export const VideoPlayerTimeRange = ({
  className,
  ...props
}: VideoPlayerTimeRangeProps) => (
  <MediaTimeRange className={cn("p-2.5 min-w-12", className)} {...props} />
);

export type VideoPlayerTimeDisplayProps = ComponentProps<
  typeof MediaTimeDisplay
>;

export const VideoPlayerTimeDisplay = ({
  className,
  ...props
}: VideoPlayerTimeDisplayProps) => (
  <MediaTimeDisplay
    className={cn("p-2.5 text-xs tabular-nums tracking-tight", className)}
    {...props}
  />
);

export type VideoPlayerVolumeRangeProps = ComponentProps<
  typeof MediaVolumeRange
>;

export const VideoPlayerVolumeRange = ({
  className,
  ...props
}: VideoPlayerVolumeRangeProps) => (
  <MediaVolumeRange className={cn("p-2 rounded-md", className)} {...props} />
);

export type VideoPlayerPlayButtonProps = ComponentProps<typeof MediaPlayButton>;

export const VideoPlayerPlayButton = ({
  className,
  ...props
}: VideoPlayerPlayButtonProps) => (
  <MediaPlayButton className={cn("p-2 rounded-md", className)} {...props} />
);

export type VideoPlayerSeekBackwardButtonProps = ComponentProps<
  typeof MediaSeekBackwardButton
>;

export const VideoPlayerSeekBackwardButton = ({
  className,
  ...props
}: VideoPlayerSeekBackwardButtonProps) => (
  <MediaSeekBackwardButton
    className={cn("p-2 rounded-md", className)}
    {...props}
  />
);

export type VideoPlayerSeekForwardButtonProps = ComponentProps<
  typeof MediaSeekForwardButton
>;

export const VideoPlayerSeekForwardButton = ({
  className,
  ...props
}: VideoPlayerSeekForwardButtonProps) => (
  <MediaSeekForwardButton
    className={cn("p-2 rounded-md", className)}
    {...props}
  />
);

export type VideoPlayerMuteButtonProps = ComponentProps<typeof MediaMuteButton>;

export const VideoPlayerMuteButton = ({
  className,
  ...props
}: VideoPlayerMuteButtonProps) => (
  <MediaMuteButton className={cn("p-2 rounded-md", className)} {...props} />
);

export type VideoPlayerPlaybackRateButtonProps = ComponentProps<
  typeof MediaPlaybackRateButton
>;

export const VideoPlayerPlaybackRateButton = ({
  className,
  ...props
}: VideoPlayerPlaybackRateButtonProps) => (
  <MediaPlaybackRateButton
    className={cn("p-2 rounded-md", className)}
    {...props}
  />
);

export type VideoPlayerFullscreenButtonProps = ComponentProps<
  typeof MediaFullscreenButton
>;

export const VideoPlayerFullscreenButton = ({
  className,
  ...props
}: VideoPlayerFullscreenButtonProps) => (
  <MediaFullscreenButton
    className={cn("p-2 rounded-md", className)}
    {...props}
  />
);

export type VideoPlayerContentProps = ComponentProps<"video">;

export const VideoPlayerContent = ({
  className,
  ...props
}: VideoPlayerContentProps) => (
  <video className={cn("mt-0 mb-0", className)} {...props} />
);

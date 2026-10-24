"use client";

import { useState } from "react";
import { cn } from "@eva/ui";
import {
  VideoPlayer,
  VideoPlayerContent,
  VideoPlayerControlBar,
  VideoPlayerFullscreenButton,
  VideoPlayerMuteButton,
  VideoPlayerPlayButton,
  VideoPlayerPlaybackRateButton,
  VideoPlayerSeekBackwardButton,
  VideoPlayerSeekForwardButton,
  VideoPlayerTimeDisplay,
  VideoPlayerTimeRange,
  VideoPlayerVolumeRange,
} from "@vvedantb/ui";
import { ImageLightbox } from "@/lib/components/ImageLightbox";

export function VideoPreview({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  return (
    <VideoPlayer className={cn("max-w-full", className)}>
      <VideoPlayerContent
        src={url}
        playsInline
        preload="metadata"
        slot="media"
      />
      {/* Nine controls do not fit a phone-width bar. Playback rate and the
          volume slider drop out below `sm` — a phone has hardware volume keys,
          and everything essential (play, scrub, time, mute, fullscreen) stays. */}
      <VideoPlayerControlBar>
        <VideoPlayerPlayButton />
        <VideoPlayerSeekBackwardButton />
        <VideoPlayerSeekForwardButton />
        <VideoPlayerTimeRange />
        <VideoPlayerTimeDisplay showDuration />
        <VideoPlayerPlaybackRateButton
          rates={[1, 3, 5, 8]}
          className="max-sm:hidden"
        />
        <VideoPlayerMuteButton />
        <VideoPlayerVolumeRange className="max-sm:hidden" />
        <VideoPlayerFullscreenButton />
      </VideoPlayerControlBar>
    </VideoPlayer>
  );
}

export function ScreenshotPreview({
  url,
  alt = "Screenshot",
  className,
}: {
  url: string;
  alt?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block">
        <img
          src={url}
          alt={alt}
          className={cn(
            "media-outline rounded-surface max-w-full cursor-pointer transition-opacity hover:opacity-90",
            className,
          )}
        />
      </button>
      <ImageLightbox
        images={[{ url, alt }]}
        index={open ? 0 : null}
        onIndexChange={() => undefined}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

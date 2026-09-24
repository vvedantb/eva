"use client";

import * as React from "react";
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";
import { SURFACE_RADIUS_CLASS } from "../utils/surface-radius";
import { Spinner } from "./spinner";

/**
 * Icons mirroring HeroUI's toast icon map (`@heroui/shared-icons`): info-filled
 * for neutral/info, plus success / warning / danger. Rendered at 24px like
 * HeroUI's `icon` slot (`w-6 h-6 flex-none fill-current`) rather than sonner's
 * 16px default, and tinted with the app's semantic tokens.
 */
function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6 fill-current text-primary"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 22C17.51 22 22 17.51 22 12C22 6.49 17.51 2 12 2C6.49 2 2 6.49 2 12C2 17.51 6.49 22 12 22ZM12.75 16C12.75 16.41 12.41 16.75 12 16.75C11.59 16.75 11.25 16.41 11.25 16L11.25 11C11.25 10.59 11.59 10.25 12 10.25C12.41 10.25 12.75 10.59 12.75 11L12.75 16ZM11.08 7.62C11.13 7.49 11.2 7.39 11.29 7.29C11.39 7.2 11.5 7.13 11.62 7.08C11.74 7.03 11.87 7 12 7C12.13 7 12.26 7.03 12.38 7.08C12.5 7.13 12.61 7.2 12.71 7.29C12.8 7.39 12.87 7.49 12.92 7.62C12.97 7.74 13 7.87 13 8C13 8.13 12.97 8.26 12.92 8.38C12.87 8.5 12.8 8.61 12.71 8.71C12.61 8.8 12.5 8.87 12.38 8.92C12.14 9.02 11.86 9.02 11.62 8.92C11.5 8.87 11.39 8.8 11.29 8.71C11.2 8.61 11.13 8.5 11.08 8.38C11.03 8.26 11 8.13 11 8C11 7.87 11.03 7.74 11.08 7.62Z" />
    </svg>
  );
}

function SuccessIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6 fill-current text-success"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 2C6.49 2 2 6.49 2 12C2 17.51 6.49 22 12 22C17.51 22 22 17.51 22 12C22 6.49 17.51 2 12 2ZM16.78 9.7L11.11 15.37C10.97 15.51 10.78 15.59 10.58 15.59C10.38 15.59 10.19 15.51 10.05 15.37L7.22 12.54C6.93 12.25 6.93 11.77 7.22 11.48C7.51 11.19 7.99 11.19 8.28 11.48L10.58 13.78L15.72 8.64C16.01 8.35 16.49 8.35 16.78 8.64C17.07 8.93 17.07 9.4 16.78 9.7Z" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6 fill-current text-warning"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        clipRule="evenodd"
        d="M3 10.417C3 7.219 3 5.62 3.378 5.082C3.755 4.545 5.258 4.03 8.265 3.001L8.838 2.805C10.405 2.268 11.188 2 12 2C12.812 2 13.595 2.268 15.162 2.805L15.735 3.001C18.742 4.03 20.245 4.545 20.622 5.082C21 5.62 21 7.22 21 10.417V11.991C21 17.629 16.761 20.366 14.101 21.527C13.38 21.842 13.02 22 12 22C10.98 22 10.62 21.842 9.899 21.527C7.239 20.365 3 17.63 3 11.991V10.417ZM12 7.25C12.1989 7.25 12.3897 7.32902 12.5303 7.46967C12.671 7.61032 12.75 7.80109 12.75 8V12C12.75 12.1989 12.671 12.3897 12.5303 12.5303C12.3897 12.671 12.1989 12.75 12 12.75C11.8011 12.75 11.6103 12.671 11.4697 12.5303C11.329 12.3897 11.25 12.1989 11.25 12V8C11.25 7.80109 11.329 7.61032 11.4697 7.46967C11.6103 7.32902 11.8011 7.25 12 7.25ZM12 16C12.2652 16 12.5196 15.8946 12.7071 15.7071C12.8946 15.5196 13 15.2652 13 15C13 14.7348 12.8946 14.4804 12.7071 14.2929C12.5196 14.1054 12.2652 14 12 14C11.7348 14 11.4804 14.1054 11.2929 14.2929C11.1054 14.4804 11 14.7348 11 15C11 15.2652 11.1054 15.5196 11.2929 15.7071C11.4804 15.8946 11.7348 16 12 16Z"
        fillRule="evenodd"
      />
    </svg>
  );
}

function DangerIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6 fill-current text-destructive"
      fill="none"
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.51 3.85L11.57 0.42C10.6 -0.14 9.4 -0.14 8.42 0.42L2.49 3.85C1.52 4.41 0.919998 5.45 0.919998 6.58V13.42C0.919998 14.54 1.52 15.58 2.49 16.15L8.43 19.58C9.4 20.14 10.6 20.14 11.58 19.58L17.52 16.15C18.49 15.59 19.09 14.55 19.09 13.42V6.58C19.08 5.45 18.48 4.42 17.51 3.85ZM9.25 5.75C9.25 5.34 9.59 5 10 5C10.41 5 10.75 5.34 10.75 5.75V11C10.75 11.41 10.41 11.75 10 11.75C9.59 11.75 9.25 11.41 9.25 11V5.75ZM10.92 14.63C10.87 14.75 10.8 14.86 10.71 14.96C10.52 15.15 10.27 15.25 10 15.25C9.87 15.25 9.74 15.22 9.62 15.17C9.49 15.12 9.39 15.05 9.29 14.96C9.2 14.86 9.13 14.75 9.07 14.63C9.02 14.51 9 14.38 9 14.25C9 13.99 9.1 13.73 9.29 13.54C9.39 13.45 9.49 13.38 9.62 13.33C9.99 13.17 10.43 13.26 10.71 13.54C10.8 13.64 10.87 13.74 10.92 13.87C10.97 13.99 11 14.12 11 14.25C11 14.38 10.97 14.51 10.92 14.63Z" />
    </svg>
  );
}

/** Replaces sonner's 16px bar spinner so the loading slot matches the 24px icons. */
function LoadingIcon() {
  return <Spinner size="md" aria-hidden="true" />;
}

/** HeroUI's `CloseIcon` â€” 2px round-capped cross. */
function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

const TOAST_ICONS = {
  success: <SuccessIcon />,
  info: <InfoIcon />,
  warning: <WarningIcon />,
  error: <DangerIcon />,
  loading: <LoadingIcon />,
  close: <CloseIcon />,
};

/**
 * Sonner keeps a handful of rules that are *not* gated on `data-styled`, and
 * they out-specify utility classes. The dark-theme close-button rule reads
 * these variables, so pointing them at design tokens keeps the close chip on
 * the same colours as its light-mode classes below.
 */
const TOASTER_STYLE: React.CSSProperties & Record<`--${string}`, string> = {
  // Sonner's own CSS hardcodes a system font stack on `[data-sonner-toaster]`,
  // which beats inheritance from `body`. `inherit` wins that fight so toasts
  // follow `--font-sans` like the rest of the app.
  fontFamily: "inherit",
  "--normal-bg": "rgb(var(--card))",
  "--normal-border": "rgb(var(--border))",
  "--normal-text": "rgb(var(--foreground))",
  "--normal-bg-hover": "rgb(var(--muted))",
  "--normal-border-hover": "rgb(var(--border))",
};

/**
 * Thin wrapper around sonner's Toaster, styled to match HeroUI's `Toast`
 * (`@heroui/theme` â†’ `components/toast.ts`, variant `flat`, colour `default`):
 * 12px padding, a 24px icon 16px from the text, `text-sm` medium title over a
 * muted description, and a circular close chip at the top-right that fades in
 * on hover. HeroUI's fixed `rounded-medium` / `shadow-small` are mapped onto
 * `rounded-surface` and `shadow-md` so toasts keep following the theme radius
 * and light/dark tokens.
 *
 * `unstyled` is required, not cosmetic: sonner's built-in rules are keyed on
 * `[data-sonner-toast][data-styled=true]`, whose specificity beats every
 * utility class below. Opting out of them is what lets these classes apply â€”
 * and it also means the layout sonner normally supplies (flex, width, close
 * button positioning) has to be declared here.
 *
 * Theme-agnostic: the consuming app passes `theme` since the theme lives in
 * the app, not this package.
 */
function Toaster({ style, ...props }: ToasterProps) {
  return (
    <SonnerToaster
      closeButton
      gap={8}
      icons={TOAST_ICONS}
      style={style ? { ...TOASTER_STYLE, ...style } : TOASTER_STYLE}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: [
            "group flex w-full cursor-pointer items-center gap-x-4 p-3 font-sans text-sm",
            SURFACE_RADIUS_CLASS,
            "bg-card/95 text-foreground backdrop-blur-md smooth-shadow-ring-md",
            // Hides the content of collapsed toasts behind the front one.
            // Sonner's rule for this is gated on the styling we opt out of.
            "[&[data-expanded=false][data-front=false]>*]:opacity-0",
          ].join(" "),
          // `relative` anchors sonner's absolutely-positioned `.sonner-loader`.
          icon: "relative flex h-6 w-6 shrink-0 items-center justify-center",
          content: "flex min-w-0 grow flex-col",
          // HeroUI truncates the title; eva's toasts are mostly title-only
          // sentences, so this wraps instead of dropping the message.
          title: "me-4 wrap-break-word font-medium text-foreground",
          // `!` is load-bearing: sonner's `[data-sonner-theme=dark]
          // [data-description]` rule hardcodes a colour and out-specifies
          // utilities without being gated on `data-styled`.
          description: "me-4 wrap-break-word text-muted-foreground!",
          actionButton:
            "h-7 shrink-0 rounded-control bg-primary px-2.5 text-xs font-medium text-primary-foreground motion-press active:scale-[0.96] hover:bg-primary/90",
          cancelButton:
            "h-7 shrink-0 rounded-control bg-muted px-2.5 text-xs font-medium text-muted-foreground motion-press active:scale-[0.96] hover:bg-muted/80",
          closeButton:
            // `reveal-on-hover` carries the whole hide/reveal, including moving
            // `pointer-events` with the opacity. Spelling it out here as
            // `sm:opacity-0 group-hover:opacity-100` would leave the button
            // permanently invisible on a landscape tablet — `group-hover:`
            // compiles with `@media (hover: hover)`, `sm:opacity-0` does not —
            // and a toast with no reachable close is a toast you cannot dismiss.
            "pointer-events-none absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground opacity-0 transition-opacity duration-[var(--motion-base)] hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring group-hover:pointer-events-auto group-hover:opacity-100 max-sm:pointer-events-auto max-sm:opacity-100 max-sm:hit-target",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
export { toast } from "sonner";

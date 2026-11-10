// Brand-colored provider marks for env slots. Paths sourced from svgl (Convex,
// Vercel). Theme-sensitive marks use currentColor so they stay visible in light
// and dark UI.

import { cn } from "@eva/ui";
import { ProviderIcon } from "@vvedantb/ui";
import type { AIProvider } from "@eva/backend";

interface ProviderLogoProps {
  size?: number;
  className?: string;
}

const VERCEL_PATH = "M24 22.525H0l12-21.05 12 21.05z";

/**
 * The four AI provider marks come from the package's `ProviderIcon`. These
 * wrappers keep them labelled images, since env slots show them on their own.
 */
function providerLogo(provider: AIProvider, label: string) {
  return function ProviderLogo({ size = 16, className }: ProviderLogoProps) {
    return (
      <ProviderIcon
        provider={provider}
        size={size}
        className={className}
        role="img"
        aria-label={label}
        aria-hidden={false}
      />
    );
  };
}

export const ClaudeLogo = providerLogo("claude", "Claude");
export const OpenAILogo = providerLogo("codex", "OpenAI");
export const CursorLogo = providerLogo("cursor", "Cursor");
export const OpenCodeLogo = providerLogo("opencode", "OpenCode");

export function VercelLogo({ size = 16, className }: ProviderLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      role="img"
      aria-label="Vercel"
      className={cn("text-black dark:text-white", className)}
    >
      <path d={VERCEL_PATH} />
    </svg>
  );
}

/** Convex mark — paths from svgl `convex.svg`. */
export function LinearLogo({ size = 16, className }: ProviderLogoProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label="Linear"
      className={className}
    >
      <path
        fill="#5E6AD2"
        d="M1.225 61.523c-.222-.949.908-1.546 1.597-.857l36.512 36.512c.69.69.092 1.82-.857 1.597-18.425-4.323-32.93-18.827-37.252-37.252ZM.002 46.889a.99.99 0 0 0 .29.76L52.35 99.71c.201.2.478.307.76.29 2.37-.149 4.695-.46 6.963-.927.765-.157 1.03-1.096.478-1.648L2.576 39.448c-.552-.551-1.491-.286-1.648.479a50.067 50.067 0 0 0-.926 6.962ZM4.21 29.705a.988.988 0 0 0 .208 1.1l64.776 64.776c.289.29.726.375 1.1.208a49.908 49.908 0 0 0 5.185-2.684.981.981 0 0 0 .183-1.54L8.436 24.336a.981.981 0 0 0-1.541.183 49.896 49.896 0 0 0-2.684 5.185Zm8.448-11.631a.986.986 0 0 1-.045-1.354C21.78 6.46 35.111 0 49.952 0 77.592 0 100 22.407 100 50.048c0 14.84-6.46 28.172-16.72 37.338a.986.986 0 0 1-1.354-.045L12.659 18.074Z"
      />
    </svg>
  );
}

export function FigmaLogo({ size = 16, className }: ProviderLogoProps) {
  return (
    <svg
      viewBox="0 0 54 80"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label="Figma"
      className={className}
    >
      <path
        d="M13.3333 80.0002C20.6933 80.0002 26.6667 74.0268 26.6667 66.6668V53.3335H13.3333C5.97333 53.3335 0 59.3068 0 66.6668C0 74.0268 5.97333 80.0002 13.3333 80.0002Z"
        fill="#0ACF83"
      />
      <path
        d="M0 39.9998C0 32.6398 5.97333 26.6665 13.3333 26.6665H26.6667V53.3332H13.3333C5.97333 53.3332 0 47.3598 0 39.9998Z"
        fill="#A259FF"
      />
      <path
        d="M0 13.3333C0 5.97333 5.97333 0 13.3333 0H26.6667V26.6667H13.3333C5.97333 26.6667 0 20.6933 0 13.3333Z"
        fill="#F24E1E"
      />
      <path
        d="M26.6667 0H40.0001C47.3601 0 53.3334 5.97333 53.3334 13.3333C53.3334 20.6933 47.3601 26.6667 40.0001 26.6667H26.6667V0Z"
        fill="#FF7262"
      />
      <path
        d="M53.3334 39.9998C53.3334 47.3598 47.3601 53.3332 40.0001 53.3332C32.6401 53.3332 26.6667 47.3598 26.6667 39.9998C26.6667 32.6398 32.6401 26.6665 40.0001 26.6665C47.3601 26.6665 53.3334 32.6398 53.3334 39.9998Z"
        fill="#1ABCFE"
      />
    </svg>
  );
}

export function ConvexLogo({ size = 16, className }: ProviderLogoProps) {
  return (
    <svg
      viewBox="28 28 128 132"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label="Convex"
      className={className}
    >
      <path
        fill="#F3B01C"
        d="M108.092 130.021c18.166-2.018 35.293-11.698 44.723-27.854-4.466 39.961-48.162 65.218-83.83 49.711-3.286-1.425-6.115-3.796-8.056-6.844-8.016-12.586-10.65-28.601-6.865-43.135 10.817 18.668 32.81 30.111 54.028 28.122Z"
      />
      <path
        fill="#8D2676"
        d="M53.401 90.174c-7.364 17.017-7.682 36.94 1.345 53.336-31.77-23.902-31.423-75.052-.388-98.715 2.87-2.187 6.282-3.485 9.86-3.683 14.713-.776 29.662 4.91 40.146 15.507-21.3.212-42.046 13.857-50.963 33.555Z"
      />
      <path
        fill="#EE342F"
        d="M114.637 61.855C103.89 46.87 87.069 36.668 68.639 36.358c35.625-16.17 79.446 10.047 84.217 48.807.444 3.598-.139 7.267-1.734 10.512-6.656 13.518-18.998 24.002-33.42 27.882 10.567-19.599 9.263-43.544-3.065-61.704Z"
      />
    </svg>
  );
}

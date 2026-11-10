// Brand-coloured provider marks for env slots and connections. The artwork
// comes from the package (`ProviderIcon`, `@vvedantb/ui/logos`); these wrappers
// only keep each mark a labelled image, since slots show them on their own.

import { cn } from "@eva/ui";
import type { ComponentType } from "react";
import {
  ConvexIcon,
  FigmaIcon,
  LinearIcon,
  ProviderIcon,
  VercelIcon,
  type LogoProps,
} from "@vvedantb/ui";
import type { AIProvider } from "@eva/backend";

interface ProviderLogoProps {
  size?: number;
  className?: string;
}

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

function brandLogo(
  Icon: ComponentType<LogoProps>,
  label: string,
  toneClass?: string,
) {
  return function BrandLogo({ size = 16, className }: ProviderLogoProps) {
    return (
      <Icon size={size} title={label} className={cn(toneClass, className)} />
    );
  };
}

/** Monochrome (`currentColor`): black in light, white in dark. */
export const VercelLogo = brandLogo(
  VercelIcon,
  "Vercel",
  "text-black dark:text-white",
);
export const LinearLogo = brandLogo(LinearIcon, "Linear");
export const FigmaLogo = brandLogo(FigmaIcon, "Figma");
export const ConvexLogo = brandLogo(ConvexIcon, "Convex");

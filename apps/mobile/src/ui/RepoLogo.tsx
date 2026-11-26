import { EVA_THEME } from "@eva/shared/evaTheme";
import type { ReactNode } from "react";
import { Image } from "react-native";
import { useScheme } from "@/ui/theme";

/** Eva's web `rounded-md` (14), which rounds every logo up to 28 into a circle. */
const ROUNDED_MD = 14;

/**
 * The web `RepoLogo`: the repo's uploaded logo at `size` (`rounded-md`, a
 * 1-wide border; `bordered={false}` is the web `border-0`), else `fallback`,
 * the place's own letter tile or GitHub mark (nothing when unset).
 */
export function RepoLogo({
  logoUrl,
  size,
  bordered = true,
  fallback = null,
}: {
  logoUrl: string | null | undefined;
  size: number;
  bordered?: boolean;
  fallback?: ReactNode;
}) {
  const scheme = useScheme();
  if (!logoUrl) return fallback;
  return (
    <Image
      source={{ uri: logoUrl }}
      accessibilityIgnoresInvertColors
      resizeMode="cover"
      style={{
        width: size,
        height: size,
        borderRadius: Math.min(ROUNDED_MD, size / 2),
        borderWidth: bordered ? 1 : 0,
        borderColor: EVA_THEME[scheme].border,
      }}
    />
  );
}

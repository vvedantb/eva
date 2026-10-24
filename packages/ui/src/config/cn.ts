import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * eva's class merger. Unlike vvedantb's `cn`, it does not treat
 * `rounded-surface` / `-control` / `-menu-item` as radius classes, so a caller
 * `rounded-*` class sits next to them and eva's CSS order decides, as it
 * always has.
 */
export function evaCn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function cssColor(name: string, alpha = 1): string {
  if (typeof document === "undefined") return "transparent";
  // Design tokens are stored as space-separated sRGB channels (e.g. "56 189 248"),
  // so wrap in rgb() — not oklch() — to match how Tailwind consumes them.
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim();
  return `rgb(${v} / ${alpha})`;
}

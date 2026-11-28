export function cssColor(name: string, alpha = 1): string {
  if (typeof document === "undefined") return "transparent";
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim();
  return `rgb(${v} / ${alpha})`;
}

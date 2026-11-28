import {
  createElement,
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import { IconLayoutGrid } from "@tabler/icons-react";

interface TablerIconByNameProps {
  name: string;
  variant?: "default" | "filled";
  className?: string;
}

const BOLD_FALLBACK_STROKE_WIDTH = 2.75;

interface IconProps {
  className?: string;
}

const SVG_ATTRS: Record<
  "outline" | "filled",
  Record<string, string | number>
> = {
  outline: {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  filled: {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    stroke: "none",
  },
};

function iconFromData(
  variant: "outline" | "filled",
  nodes: [string, Record<string, string | number>][],
  strokeWidth?: number,
): ComponentType<IconProps> {
  const attrs =
    strokeWidth === undefined
      ? SVG_ATTRS[variant]
      : { ...SVG_ATTRS[variant], strokeWidth };
  return function TablerDataIcon({ className }: IconProps) {
    return (
      <svg {...attrs} className={className}>
        {nodes.map(([tag, attrs], index) =>
          createElement(tag, { ...attrs, key: index }),
        )}
      </svg>
    );
  };
}

const lazyIcons = new Map<
  string,
  LazyExoticComponent<ComponentType<IconProps>>
>();

function lazyIconFor(name: string, variant: "default" | "filled") {
  const key = `${variant}:${name}`;
  const cached = lazyIcons.get(key);
  if (cached) {
    return cached;
  }

  const Icon = lazy(async () => {
    const { default: icons } = await import("virtual:tabler-icon-data");
    const filled = variant === "filled" ? icons[`${name}Filled`] : undefined;
    if (filled) return { default: iconFromData(filled[0], filled[1]) };
    const spec = icons[name];
    if (!spec) return { default: IconLayoutGrid };
    const strokeWidth =
      variant === "filled" ? BOLD_FALLBACK_STROKE_WIDTH : undefined;
    return { default: iconFromData(spec[0], spec[1], strokeWidth) };
  });

  lazyIcons.set(key, Icon);
  return Icon;
}

export function TablerIconByName({
  name,
  variant = "default",
  className,
}: TablerIconByNameProps) {
  const Icon = lazyIconFor(name, variant);

  return (
    <Suspense fallback={<IconLayoutGrid className={className} />}>
      <Icon className={className} />
    </Suspense>
  );
}

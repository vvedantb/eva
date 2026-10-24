import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../utils/cn";
import { SURFACE_RADIUS_CLASS } from "../utils/surface-radius";

/**
 * A panel with the standard card fill and one of four paddings.
 *
 * `Card` already owns this recipe, but it splits padding across Header /
 * Content / Footer — which is right for a titled card and wrong for the thirty
 * places that just need one padded box. Those all re-typed
 * `rounded-surface bg-card p-N` by hand, landing on two radii and five paddings.
 *
 * Density is a prop rather than a `className` so the paddings stay a closed
 * set. Anything outside the set is a layout decision worth making deliberately,
 * and `className` still overrides when it genuinely is one.
 */
const surfaceVariants = cva(
  `${SURFACE_RADIUS_CLASS} bg-card text-card-foreground`,
  {
    variants: {
      density: {
        // Dense list items and inline panels.
        tight: "p-3",
        // The default box: settings sections, stat cards, banners.
        default: "p-4",
        // Standalone cards that carry a heading of their own.
        comfortable: "p-6",
        // The caller owns padding entirely — for surfaces with their own
        // internal regions, such as a table that must reach the edge.
        none: "",
      },
    },
    defaultVariants: {
      density: "default",
    },
  },
);

export interface SurfaceProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof surfaceVariants> {}

const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, density, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(surfaceVariants({ density }), className)}
      {...props}
    />
  ),
);
Surface.displayName = "Surface";

export { Surface, surfaceVariants };

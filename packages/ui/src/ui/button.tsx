import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../utils/cn";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold tracking-[-0.01em] motion-press focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 active:scale-[0.96] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-muted/60",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        // Sizes under the 40px comfortable-tap floor grow their pressable area
        // by 8px on every side via a pseudo-element, without touching layout.
        // Row-level controls were being hand-sized to `size-6`/`size-7`
        // precisely because these did not exist, and an audit found ~45 sub-40px
        // targets against 17 uses of the utility: a compliant target has to come
        // from the variant, or it does not come at all.
        //
        // `sm`/`icon-sm` take it as `max-sm:hit-target`, not `hit-target`: the
        // 8px bleed is invisible but it *is* a change to where a pointer has to
        // be to click, so on desktop these stay exactly the 32px targets they
        // always were. `xs`/`icon-xs` keep the ungated utility they shipped with.
        // (`.hit-target` must not override Tailwind `absolute` — see globals.css.)
        xs: "h-7 rounded-md px-2 text-2xs hit-target [&_svg]:size-3.5",
        sm: "h-8 rounded-lg px-3 text-xs max-sm:hit-target",
        lg: "h-11 rounded-lg px-6",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 max-sm:hit-target",
        "icon-xs": "h-7 w-7 hit-target [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

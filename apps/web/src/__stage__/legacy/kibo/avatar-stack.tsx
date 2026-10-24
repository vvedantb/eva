"use client";

import { Children, type ReactNode } from "react";
import { cn } from "../utils/cn";

export type AvatarStackProps = {
  children: ReactNode;
  className?: string;
  size?: number;
};

export const AvatarStack = ({
  children,
  className,
  size = 24,
  ...props
}: AvatarStackProps) => (
  <div className={cn("-space-x-1.5 flex items-center", className)} {...props}>
    {Children.map(children, (child, index) => {
      if (!child) return null;
      return (
        <div
          className="shrink-0 overflow-hidden rounded-full"
          style={{
            width: size,
            height: size,
            maskImage: index
              ? `radial-gradient(circle ${size / 2}px at -${size / 4 + size / 10}px 50%, transparent 99%, white 100%)`
              : "",
          }}
        >
          {child}
        </div>
      );
    })}
  </div>
);

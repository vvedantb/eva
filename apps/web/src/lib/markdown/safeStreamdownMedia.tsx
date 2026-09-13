import type { ReactNode } from "react";
import { isSafeMediaUrl } from "@/lib/utils/safeMediaUrl";

/** Drop javascript:/data: images in Streamdown surfaces that use defaults. */
export const safeStreamdownMediaComponents = {
  img: ({
    src,
    alt,
    ...props
  }: {
    src?: string;
    alt?: string;
    [key: string]: unknown;
  }) =>
    typeof src === "string" && src.length > 0 && isSafeMediaUrl(src) ? (
      <img src={src} alt={typeof alt === "string" ? alt : ""} {...props} />
    ) : null,
  a: ({
    href,
    children,
    ...props
  }: {
    href?: string;
    children?: ReactNode;
    [key: string]: unknown;
  }) =>
    typeof href === "string" && isSafeMediaUrl(href) ? (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
};

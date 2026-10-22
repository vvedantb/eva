import { EvaIcon } from "@/lib/components/EvaIcon";

/** Logo + wordmark, shared by both pages' navs and the footer. */
export function LandingBrand({ href }: { href?: string }) {
  const mark = (
    <>
      <EvaIcon size={24} label={null} className="size-6 rounded-full" />
      <span className="text-base font-semibold tracking-tight text-foreground">
        Eva
      </span>
    </>
  );

  if (!href) {
    return <span className="flex shrink-0 items-center gap-2.5">{mark}</span>;
  }

  return (
    <a
      href={href}
      className="flex shrink-0 items-center gap-2.5 rounded-control focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {mark}
    </a>
  );
}

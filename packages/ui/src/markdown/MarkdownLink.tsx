import type { ComponentProps, ReactNode, SyntheticEvent } from "react";
import { Children } from "react";
import { IconBrandGithub, IconWorld } from "@tabler/icons-react";
import type { ExtraProps } from "streamdown";

/** Streamdown's placeholder href for a link whose `(url)` has not streamed yet. */
const INCOMPLETE_LINK = "streamdown:incomplete-link";
/** Break opportunities in a bare URL: after separators, never mid-word. */
const URL_BREAK_AFTER = /([/.?&=#_-]+)/;

/** Hosts whose favicon is a black glyph that vanishes in dark mode. */
const MONOCHROME_HOSTS = new Set(["github.com", "gist.github.com"]);
/** Hosts whose favicon failed this session; they get the globe from now on. */
const failedFavicons = new Set<string>();

function externalHost(href: string): string | null {
  if (!URL.canParse(href)) return null;
  const url = new URL(href);
  return url.protocol === "https:" || url.protocol === "http:" ? url.host : null;
}

function forgetFavicon(event: SyntheticEvent<HTMLImageElement>, host: string) {
  failedFavicons.add(host);
  event.currentTarget.dataset.failed = "true";
}

/**
 * A pasted URL is one unbreakable word, so it either overflows or, with
 * `overflow-wrap: anywhere`, splits at an arbitrary letter. `<wbr>` after
 * each separator lets it wrap where a reader expects.
 */
export function breakableUrl(text: string): ReactNode[] {
  return text
    .split(URL_BREAK_AFTER)
    .flatMap((part, index) =>
      index % 2 === 1 ? [part, <wbr key={index} />] : part === "" ? [] : [part],
    );
}

function LinkLabel({ children, href }: { children: ReactNode; href: string }) {
  const parts = Children.toArray(children);
  const only = parts.length === 1 ? parts[0] : undefined;
  if (typeof only === "string" && (only === href || /^https?:\/\//.test(only))) {
    return <>{breakableUrl(only)}</>;
  }
  return <>{children}</>;
}

/**
 * `a` renderer. External links open in a new tab behind the site's own
 * favicon (fetched from that host, never a third-party favicon service), with
 * a globe when it has none and a brand glyph for GitHub. In-page anchors and other schemes stay plain.
 */
export function MarkdownLink({ href, children }: ComponentProps<"a"> & ExtraProps) {
  if (href === undefined || href === INCOMPLETE_LINK) {
    return <span className="markdown-link">{children}</span>;
  }
  const host = externalHost(href);
  if (host === null) {
    return (
      <a className="markdown-link" href={href}>
        {children}
      </a>
    );
  }
  return (
    <a
      className="markdown-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
    >
      {MONOCHROME_HOSTS.has(host) ? (
        <IconBrandGithub className="markdown-link-icon" aria-hidden />
      ) : failedFavicons.has(host) ? (
        <IconWorld className="markdown-link-icon" aria-hidden />
      ) : (
        <img
          className="markdown-link-icon"
          src={`https://${host}/favicon.ico`}
          alt=""
          aria-hidden
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => forgetFavicon(event, host)}
        />
      )}
      <LinkLabel href={href}>{children}</LinkLabel>
    </a>
  );
}

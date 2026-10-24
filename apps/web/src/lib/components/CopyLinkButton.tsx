"use client";

import { DropdownMenuItem } from "@vvedantb/ui";
import { IconLink } from "@tabler/icons-react";

/**
 * Copies the current page URL — shared More-menu item for task / project /
 * session headers. Pass `path` when the current URL is not a link to the
 * entity: Manager Ave's chat is mounted inline at the per-user `/ave`,
 * which resolves to a *different* session for everyone else.
 */
export function CopyLinkMenuItem({
  iconSize = 14,
  path,
}: {
  iconSize?: number;
  path?: string;
}) {
  return (
    <DropdownMenuItem
      onClick={() => {
        const href = path
          ? new URL(path, window.location.origin).href
          : window.location.href;
        void navigator.clipboard.writeText(href);
      }}
    >
      <IconLink size={iconSize} />
      Copy link
    </DropdownMenuItem>
  );
}

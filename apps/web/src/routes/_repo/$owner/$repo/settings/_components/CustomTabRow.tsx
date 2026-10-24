"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Doc } from "@eva/backend";
import { Button, Input, Switch } from "@vvedantb/ui";
import { IconTrash } from "@tabler/icons-react";
import {
  RESERVED_APP_TAB_SLUGS,
  slugifyAppTabName,
} from "@/lib/utils/appTabSlug";
import { TablerIconByName } from "@/lib/components/TablerIconByName";
import {
  catchMutationError,
  mutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

interface CustomTabRowProps {
  tab: Doc<"appTabs">;
  /** Slugs already used by other tabs in this app (includes this tab's slug). */
  takenSlugs: ReadonlySet<string>;
}

function CustomTabIcon({ icon }: { icon: string }) {
  return (
    <TablerIconByName
      name={icon}
      className="h-4 w-4 shrink-0 text-muted-foreground"
    />
  );
}

/**
 * One editable custom-tab row. Fields are uncontrolled (defaultValue + onBlur):
 * each blur patches its own field while sourcing the untouched fields from the
 * live query row — no draft state mirrored from Convex.
 */
export function CustomTabRow({ tab, takenSlugs }: CustomTabRowProps) {
  const update = useMutation(api.appTabs.update);
  const toggleEnabled = useMutation(api.appTabs.toggleEnabled);
  const remove = useMutation(api.appTabs.remove);
  const [nameError, setNameError] = useState<string | null>(null);

  const ownSlug = slugifyAppTabName(tab.name);

  const handleNameBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const name = e.target.value.trim();
    if (!name || name === tab.name) {
      setNameError(null);
      e.target.value = tab.name;
      return;
    }
    const slug = slugifyAppTabName(name);
    if (!slug) {
      setNameError("Name must contain letters or numbers");
      e.target.value = tab.name;
      return;
    }
    if (RESERVED_APP_TAB_SLUGS.has(slug)) {
      setNameError(`"${name}" is reserved for a built-in tab`);
      e.target.value = tab.name;
      return;
    }
    if (slug !== ownSlug && takenSlugs.has(slug)) {
      setNameError("A tab with this name already exists");
      e.target.value = tab.name;
      return;
    }
    try {
      await update({ id: tab._id, name, icon: tab.icon, port: tab.port });
      setNameError(null);
    } catch (err) {
      mutationError("Couldn't update tab", "app-tab-update");
      setNameError(
        err instanceof Error ? err.message : "Failed to update name",
      );
      e.target.value = tab.name;
    }
  };

  const handleIconBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const icon = e.target.value.trim();
    if (!icon || icon === tab.icon) return;
    void catchMutationError(
      update({ id: tab._id, name: tab.name, icon, port: tab.port }),
      "Couldn't update tab",
      "app-tab-update",
    );
  };

  const handlePortBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const port = parseInt(e.target.value.trim(), 10);
    if (Number.isNaN(port) || port <= 0 || port > 65535 || port === tab.port) {
      return;
    }
    void catchMutationError(
      update({ id: tab._id, name: tab.name, icon: tab.icon, port }),
      "Couldn't update tab",
      "app-tab-update",
    );
  };

  return (
    // A row inside the tabs list section, so the section owns the border.
    <div className="space-y-1 px-3 py-2.5">
      {/* Name / icon / port / switch / delete is ~350px of minimum width, so
          below `sm` the icon+port+controls group takes its own row (`basis-full`)
          and only the name input shares the first line. */}
      <div className="flex max-sm:flex-wrap items-center gap-2">
        <CustomTabIcon icon={tab.icon} />
        <Input
          key={`name-${tab._id}-${tab.name}`}
          defaultValue={tab.name}
          onBlur={handleNameBlur}
          className="h-8 max-sm:min-w-0 flex-1 text-xs"
          placeholder="Name"
          aria-label="Tab name"
        />
        <div className="contents max-sm:flex max-sm:w-full max-sm:items-center max-sm:gap-2">
          <Input
            key={`icon-${tab._id}`}
            defaultValue={tab.icon}
            onBlur={handleIconBlur}
            className="h-8 w-40 text-xs font-mono max-sm:min-w-0 max-sm:w-auto max-sm:flex-1"
            placeholder="IconBolt"
            aria-label="Tab icon"
          />
          <Input
            key={`port-${tab._id}`}
            type="number"
            defaultValue={tab.port}
            onBlur={handlePortBlur}
            className="h-8 w-20 max-sm:shrink-0 text-xs sm:w-24"
            placeholder="Port"
            aria-label="Tab port"
          />
          <Switch
            checked={tab.enabled}
            onCheckedChange={(enabled) =>
              catchMutationError(
                toggleEnabled({ id: tab._id, enabled }),
                "Couldn't update tab",
                "app-tab-update",
              )
            }
            aria-label={tab.enabled ? "Disable tab" : "Enable tab"}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-10 max-sm:shrink-0 text-destructive hover:bg-destructive/10 sm:size-8"
            aria-label="Delete tab"
            onClick={() =>
              void withMutationToast(
                remove({ id: tab._id }),
                "Tab deleted",
                "Couldn't delete tab",
                "app-tab-delete",
              )
            }
          >
            <IconTrash className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {nameError ? (
        <p className="text-xs text-destructive">{nameError}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          URL slug: <code>{ownSlug}</code>
        </p>
      )}
    </div>
  );
}

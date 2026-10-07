"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@eva/backend";
import { Button, Input, toast } from "@eva/ui";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import {
  RESERVED_APP_TAB_SLUGS,
  slugifyAppTabName,
} from "@/lib/utils/appTabSlug";
import { TablerIconByName } from "@/lib/components/TablerIconByName";
import { CustomTabRow } from "./_components/CustomTabRow";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsEmptyState } from "@/lib/components/settings/SettingsEmptyState";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { SettingsField } from "@/lib/components/settings/SettingsField";
import { IconLayoutNavbar } from "@tabler/icons-react";
import { mutationSuccess } from "@/lib/utils/mutationToast";

function TabIconPreview({ icon }: { icon: string }) {
  return (
    <TablerIconByName
      name={icon}
      className="h-4 w-4 shrink-0 text-muted-foreground"
    />
  );
}

function nameError(
  name: string,
  takenSlugs: ReadonlySet<string>,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const slug = slugifyAppTabName(trimmed);
  if (!slug) return "Name must contain letters or numbers";
  if (RESERVED_APP_TAB_SLUGS.has(slug)) {
    return `"${trimmed}" is reserved for a built-in tab`;
  }
  if (takenSlugs.has(slug)) {
    return "A tab with this name already exists";
  }
  return null;
}

export function TabsSettingsClient() {
  const { repoId } = useRepo();
  const tabs = useQuery(api.appTabs.list, { repoId });
  const create = useMutation(api.appTabs.create);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [port, setPort] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const takenSlugs = (() => {
    const set = new Set<string>();
    for (const tab of tabs ?? []) {
      set.add(slugifyAppTabName(tab.name));
    }
    return set;
  })();

  const parsedPort = parseInt(port.trim(), 10);
  const portValid =
    !Number.isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535;
  const validationError = nameError(name, takenSlugs);
  const slug = slugifyAppTabName(name);
  const canAdd =
    name.trim() !== "" &&
    icon.trim() !== "" &&
    portValid &&
    validationError === null;

  async function handleAdd() {
    if (!canAdd) return;
    setSubmitError(null);
    try {
      await create({
        repoId,
        name: name.trim(),
        icon: icon.trim(),
        port: parsedPort,
        enabled: true,
      });
      setName("");
      setIcon("");
      setPort("");
      mutationSuccess("Tab added", "app-tab-create");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to add tab");
      toast.error("Couldn't add tab", { id: "app-tab-create" });
    }
  }

  const formError = validationError ?? submitError;

  return (
    <SettingsPage title="Tabs">
      <SettingsSection
        title="Add a tab"
        description="Expose a sandbox service as a session tab."
        footer={
          <Button
            size="sm"
            variant="secondary"
            disabled={!canAdd}
            onClick={handleAdd}
          >
            Add
          </Button>
        }
      >
        <div className="grid gap-5 sm:grid-cols-[1fr_10rem_6rem]">
          <SettingsField label="Name" description="Becomes the URL slug.">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSubmitError(null);
              }}
              className="h-9"
              placeholder="Supabase"
            />
          </SettingsField>
          <SettingsField
            label="Icon"
            description={
              <>
                <a
                  href="https://tabler.io/icons"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Tabler
                </a>{" "}
                name
              </>
            }
          >
            <div className="flex items-center gap-2">
              <TabIconPreview icon={icon.trim()} />
              <Input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="h-9 min-w-0 flex-1 font-mono text-xs"
                placeholder="IconBolt"
              />
            </div>
          </SettingsField>
          <SettingsField label="Port">
            <Input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="h-9"
              placeholder="53432"
            />
          </SettingsField>
        </div>
        {slug && !validationError ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Slug: <code>{slug}</code>
          </p>
        ) : null}
        {formError ? (
          <p className="mt-4 text-xs text-destructive">{formError}</p>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Custom tabs" bodyVariant="list">
        {tabs && tabs.length > 0 ? (
          <div className="divide-y divide-border/50">
            {tabs.map((tab, index) => (
              <ListEnter key={tab._id} index={index}>
                <CustomTabRow tab={tab} takenSlugs={takenSlugs} />
              </ListEnter>
            ))}
          </div>
        ) : (
          <SettingsEmptyState
            icon={IconLayoutNavbar}
            title="No custom tabs yet"
            description="Add one above to open a sandbox service in its own tab."
          />
        )}
      </SettingsSection>
    </SettingsPage>
  );
}

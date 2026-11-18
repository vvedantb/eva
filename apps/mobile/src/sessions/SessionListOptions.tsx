import {
  APP_SORT_LABELS,
  APP_SORT_ORDERS,
  clampSessionPreviewCount,
  DEFAULT_SESSION_PREVIEW_COUNT,
  MAX_SESSION_PREVIEW_COUNT,
  MIN_SESSION_PREVIEW_COUNT,
  SESSION_SORT_LABELS,
  SESSION_SORT_ORDERS,
  type AppSortOrder,
  type SessionSortOrder,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconAdjustmentsHorizontal, IconList, IconMinus, IconPlus, IconSortDescending, IconUser } from "@tabler/icons-react-native";
import { SheetRow, MenuDivider, MenuSheet, SubmenuRow } from "@vvedantb/native-ui/primitives";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";
import { jsonParser, persistedStore } from "@/storage/persistedStore";
import { useScheme } from "@/ui/theme";

/** The web Sessions sidebar options the phone list keeps (not its List/Folder layout: the phone has one). */
export type SessionListSettings = {
  appSortOrder: AppSortOrder;
  sessionSortOrder: SessionSortOrder;
  onlyMine: boolean;
  sessionPreviewCount: number;
};

const DEFAULTS: SessionListSettings = {
  appSortOrder: "updated_at",
  sessionSortOrder: "updated_at",
  onlyMine: false,
  sessionPreviewCount: DEFAULT_SESSION_PREVIEW_COUNT,
};

// Parsed field by field, so a stored value from an older build falls back to its default alone.
const settingsSchema = z.object({
  appSortOrder: z.enum(APP_SORT_ORDERS).catch(DEFAULTS.appSortOrder),
  sessionSortOrder: z.enum(SESSION_SORT_ORDERS).catch(DEFAULTS.sessionSortOrder),
  onlyMine: z.boolean().catch(DEFAULTS.onlyMine),
  sessionPreviewCount: z.number().transform(clampSessionPreviewCount).catch(DEFAULTS.sessionPreviewCount),
});

/** Kept on the device, as the web keeps them in the browser (`eva:sessions-sidebar-settings`). */
const settingsStore = persistedStore<SessionListSettings>("sessionListSettings", DEFAULTS, jsonParser(settingsSchema));

/** The list options and a setter that changes one or more of them. */
export function useSessionListSettings(): [SessionListSettings, (patch: Partial<SessionListSettings>) => void] {
  return [settingsStore.useValue("all"), (patch) => settingsStore.set("all", { ...settingsStore.get("all"), ...patch })];
}

type Page = "root" | "projects" | "threads";

/**
 * The web Sessions sidebar's options menu (`SessionsSidebarOptionsMenu`) as a
 * header button and a sheet: Sort projects and Sort threads (each a page of
 * choices), Only my sessions, and Visible threads (2 to 10 rows per section
 * before "Show more"), in the web's words. A choice applies at once.
 */
export function SessionListOptionsButton() {
  const theme = EVA_THEME[useScheme()];
  const [settings, update] = useSessionListSettings();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page>("root");
  const title = page === "projects" ? "Sort projects" : page === "threads" ? "Sort threads" : "Sessions options";

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sessions options"
        onPress={() => {
          setPage("root");
          setOpen(true);
        }}
        hitSlop={2}
        className="h-10 w-10 items-center justify-center rounded-lg active:opacity-70"
      >
        <IconAdjustmentsHorizontal size={16} color={theme.mutedForeground} />
      </Pressable>
      <MenuSheet open={open} onOpenChange={setOpen} title={title} onBack={page === "root" ? undefined : () => setPage("root")}>
        {page === "projects" ? (
          APP_SORT_ORDERS.map((order) => (
            <SheetRow
              key={order}
              title={APP_SORT_LABELS[order]}
              active={settings.appSortOrder === order}
              onPress={() => update({ appSortOrder: order })}
            />
          ))
        ) : page === "threads" ? (
          SESSION_SORT_ORDERS.map((order) => (
            <SheetRow
              key={order}
              title={SESSION_SORT_LABELS[order]}
              active={settings.sessionSortOrder === order}
              onPress={() => update({ sessionSortOrder: order })}
            />
          ))
        ) : (
          <>
            <SubmenuRow
              icon={IconSortDescending}
              title="Sort projects"
              detail={APP_SORT_LABELS[settings.appSortOrder]}
              onPress={() => setPage("projects")}
            />
            <SubmenuRow
              icon={IconList}
              title="Sort threads"
              detail={SESSION_SORT_LABELS[settings.sessionSortOrder]}
              onPress={() => setPage("threads")}
            />
            <SheetRow
              icon={IconUser}
              title="Only my sessions"
              multiple
              active={settings.onlyMine}
              onPress={() => update({ onlyMine: !settings.onlyMine })}
            />
            <MenuDivider />
            <View className="min-h-14 flex-row items-center gap-3 px-4">
              <Text className="font-instrument-sans min-w-0 flex-1 text-base" style={{ color: theme.foreground }}>
                Visible threads
              </Text>
              <StepButton
                label="Fewer visible threads"
                icon={IconMinus}
                disabled={settings.sessionPreviewCount <= MIN_SESSION_PREVIEW_COUNT}
                onPress={() => update({ sessionPreviewCount: clampSessionPreviewCount(settings.sessionPreviewCount - 1) })}
              />
              <Text
                accessibilityLabel={`${settings.sessionPreviewCount} visible threads`}
                className="font-instrument-sans-medium w-6 text-center text-base"
                style={{ color: theme.foreground, fontVariant: ["tabular-nums"] }}
              >
                {settings.sessionPreviewCount}
              </Text>
              <StepButton
                label="More visible threads"
                icon={IconPlus}
                disabled={settings.sessionPreviewCount >= MAX_SESSION_PREVIEW_COUNT}
                onPress={() => update({ sessionPreviewCount: clampSessionPreviewCount(settings.sessionPreviewCount + 1) })}
              />
            </View>
          </>
        )}
      </MenuSheet>
    </>
  );
}

/** A 44 round − or + for the Visible threads count. */
function StepButton({ label, icon: Icon, disabled, onPress }: { label: string; icon: typeof IconPlus; disabled: boolean; onPress: () => void }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
      style={{ backgroundColor: theme.muted, opacity: disabled ? 0.5 : 1 }}
    >
      <Icon size={16} color={theme.foreground} />
    </Pressable>
  );
}

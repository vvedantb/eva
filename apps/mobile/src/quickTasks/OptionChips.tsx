import type { api, Id } from "@eva/backend";
import { PRIORITY_LABELS, PRIORITY_ORDER, type Priority } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconFolder, IconPlus, IconTag, IconUserPlus } from "@tabler/icons-react-native";
import { SheetRow, Text } from "@vvedantb/native-ui/primitives";
import { SearchInput } from "@vvedantb/native-ui/search-input";
import type { FunctionReturnType } from "convex/server";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { FooterSheet } from "@/chat/ComposerFooter";
import { PriorityIcon } from "@/quickTasks/PriorityIcon";
import { InitialsAvatar } from "@/ui/InitialsAvatar";
import { textColor, useScheme } from "@/ui/theme";

type User = FunctionReturnType<typeof api.users.listAll>[number];
type Project = FunctionReturnType<typeof api.projects.list>[number];

/**
 * The web quick-task option chip (`QUICK_TASK_OPTION_BADGE_CLASS` below `sm`):
 * 40 high, fully round, `bg-secondary`, `px-2.5 gap-1.5`, `text-xs` medium,
 * muted until it holds a value, then the value in the foreground colour.
 */
export function OptionPill({
  icon,
  label,
  set,
  accessibilityLabel,
  expanded,
  disabled,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  /** The chip holds a value: its label is in the foreground colour. */
  set: boolean;
  accessibilityLabel: string;
  expanded?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded, disabled }}
      disabled={disabled}
      onPress={onPress}
      // 40 high, and 4 of slop above and below (not to the sides: the chips sit 6 apart).
      hitSlop={{ top: 2, bottom: 2 }}
      className="min-h-10 max-w-full flex-row items-center gap-1.5 rounded-full px-2.5 active:opacity-70"
      style={{ backgroundColor: theme.secondary }}
    >
      {icon}
      <Text
        numberOfLines={1}
        className="font-instrument-sans-medium shrink text-xs"
        style={{ fontWeight: "500", color: set ? theme.foreground : theme.mutedForeground }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The ModelChip or BaseBranchChip from the composer footer, on the option pill fill. */
export function OptionPillFrame({ children }: { children: ReactNode }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View className="min-h-10 max-w-full justify-center rounded-full px-1" style={{ backgroundColor: theme.secondary }}>
      {children}
    </View>
  );
}

/** The web `PriorityPicker`: "No priority", then urgent to low, each with its icon. A pick closes the sheet. */
export function PriorityChip({ value, onChange }: { value: Priority | undefined; onChange: (value: Priority | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const pick = (next: Priority | undefined) => {
    onChange(next);
    setOpen(false);
  };
  return (
    <>
      <OptionPill
        icon={<PriorityIcon level={value} />}
        label={value ? PRIORITY_LABELS[value] : "Priority"}
        set={value !== undefined}
        accessibilityLabel={`Priority: ${value ? PRIORITY_LABELS[value] : "No priority"}`}
        expanded={open}
        onPress={() => setOpen(true)}
      />
      <FooterSheet open={open} onOpenChange={setOpen} title="Priority">
        <SheetRow leading={<PriorityIcon level={undefined} size={20} />} title="No priority" active={value === undefined} onPress={() => pick(undefined)} />
        {PRIORITY_ORDER.map((priority) => (
          <SheetRow
            key={priority}
            leading={<PriorityIcon level={priority} size={20} />}
            title={PRIORITY_LABELS[priority]}
            active={value === priority}
            onPress={() => pick(priority)}
          />
        ))}
      </FooterSheet>
    </>
  );
}

/** The web `getUserDisplayName`: the full name, else first and last, else "Unknown". */
function displayName(user: User): string {
  const full = user.fullName?.trim();
  if (full) return full;
  const parts = [user.firstName, user.lastName].filter((part) => part !== undefined && part.length > 0);
  return parts.length > 0 ? parts.join(" ") : "Unknown";
}

/**
 * The web `AssigneeSelector` ("Code Reviewer"): searchable, "Unassigned",
 * then the teammates with the dev role. A pick closes the sheet.
 */
export function ReviewerChip({
  users,
  value,
  onChange,
}: {
  users: User[] | undefined;
  value: Id<"users"> | undefined;
  onChange: (value: Id<"users"> | undefined) => void;
}) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const assigned = value ? users?.find((user) => user._id === value) : undefined;
  const query = search.trim().toLowerCase();
  const reviewers = (users ?? []).filter((user) => user.role === "dev" && displayName(user).toLowerCase().includes(query));
  const pick = (next: Id<"users"> | undefined) => {
    onChange(next);
    setOpen(false);
    setSearch("");
  };
  return (
    <>
      <OptionPill
        icon={assigned ? <InitialsAvatar user={assigned} size={20} /> : <IconUserPlus size={14} color={muted} />}
        label={assigned ? displayName(assigned) : "Code Reviewer"}
        set={assigned !== undefined}
        accessibilityLabel={`Code reviewer: ${assigned ? displayName(assigned) : "Unassigned"}`}
        expanded={open}
        onPress={() => setOpen(true)}
      />
      <FooterSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
        title="Code Reviewer"
        header={
          <View className="px-2">
            <SearchInput size="md" value={search} onChange={setSearch} label="Search users" placeholder="Search users..." />
          </View>
        }
      >
        {"unassigned".includes(query) ? <SheetRow icon={IconUserPlus} title="Unassigned" active={value === undefined} onPress={() => pick(undefined)} /> : null}
        {reviewers.map((user) => (
          <SheetRow key={user._id} leading={<InitialsAvatar user={user} size={20} />} title={displayName(user)} active={user._id === value} onPress={() => pick(user._id)} />
        ))}
        {reviewers.length === 0 && !"unassigned".includes(query) ? (
          <Text variant="muted" className="py-6 text-center" style={textColor(scheme, "muted")}>
            No users found
          </Text>
        ) : null}
      </FooterSheet>
    </>
  );
}

/**
 * The web `TagsPicker`: "Tags" or "N tags"; a searchable list where a row
 * toggles a tag (the sheet stays open), and "Create "x"" adds a new one.
 */
export function TagsChip({
  allTags,
  value,
  onChange,
}: {
  allTags: string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const typed = search.trim();
  const shown = allTags.filter((tag) => tag.toLowerCase().includes(typed.toLowerCase()));
  const toggle = (tag: string) => onChange(value.includes(tag) ? value.filter((entry) => entry !== tag) : [...value, tag]);
  const create = () => {
    if (typed && !value.includes(typed)) onChange([...value, typed]);
    setSearch("");
  };
  return (
    <>
      <OptionPill
        icon={<IconTag size={14} color={muted} />}
        label={value.length > 0 ? `${value.length} tag${value.length === 1 ? "" : "s"}` : "Tags"}
        set={value.length > 0}
        accessibilityLabel={value.length > 0 ? `Tags: ${value.join(", ")}` : "Tags: none"}
        expanded={open}
        onPress={() => setOpen(true)}
      />
      <FooterSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
        title="Tags"
        header={
          <View className="px-2">
            <SearchInput
              size="md"
              value={search}
              onChange={setSearch}
              label="Search or create tag"
              placeholder="Search or create tag..."
              returnKeyType="done"
              onSubmitEditing={create}
            />
          </View>
        }
      >
        {typed && !allTags.includes(typed) ? <SheetRow icon={IconPlus} title={`Create "${typed}"`} onPress={create} /> : null}
        {/* Tags made here are not in `allTags` yet; list them so they can be removed. */}
        {[...value.filter((tag) => !allTags.includes(tag)), ...shown].map((tag) => (
          <SheetRow key={tag} icon={IconTag} title={tag} active={value.includes(tag)} onPress={() => toggle(tag)} />
        ))}
        {shown.length === 0 && !typed ? (
          <Text variant="muted" className="py-6 text-center" style={textColor(scheme, "muted")}>
            No tags
          </Text>
        ) : null}
      </FooterSheet>
    </>
  );
}

/** The web `ProjectPicker`: searchable, "No project", then the repo's projects. A pick closes the sheet. */
export function ProjectChip({
  projects,
  value,
  onChange,
}: {
  projects: Project[] | undefined;
  value: Id<"projects"> | undefined;
  onChange: (value: Id<"projects"> | undefined) => void;
}) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = value ? projects?.find((project) => project._id === value) : undefined;
  const query = search.trim().toLowerCase();
  const shown = (projects ?? []).filter((project) => project.title.toLowerCase().includes(query));
  const pick = (next: Id<"projects"> | undefined) => {
    onChange(next);
    setOpen(false);
    setSearch("");
  };
  return (
    <>
      <OptionPill
        icon={<IconFolder size={14} color={muted} />}
        label={selected ? selected.title : "Project"}
        set={selected !== undefined}
        accessibilityLabel={`Project: ${selected ? selected.title : "No project"}`}
        expanded={open}
        onPress={() => setOpen(true)}
      />
      <FooterSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
        title="Project"
        header={
          <View className="px-2">
            <SearchInput size="md" value={search} onChange={setSearch} label="Search projects" placeholder="Search projects..." />
          </View>
        }
      >
        {"no project".includes(query) ? <SheetRow title="No project" active={value === undefined} onPress={() => pick(undefined)} /> : null}
        {shown.map((project) => (
          <SheetRow key={project._id} icon={IconFolder} title={project.title} active={project._id === value} onPress={() => pick(project._id)} />
        ))}
        {shown.length === 0 && !"no project".includes(query) ? (
          <Text variant="muted" className="py-6 text-center" style={textColor(scheme, "muted")}>
            No projects found
          </Text>
        ) : null}
      </FooterSheet>
    </>
  );
}

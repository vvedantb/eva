import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconGitBranch } from "@tabler/icons-react-native";
import { PROMPT_INPUT_CHIP, PromptInputChip } from "@vvedantb/native-ui/ai";
import { Spinner, SheetRow, Text } from "@vvedantb/native-ui/primitives";
import { SearchInput } from "@vvedantb/native-ui/search-input";
import { toast } from "@vvedantb/native-ui/toast";
import { useAction } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { View } from "react-native";
import { FOOTER_CHIP, FooterSheet, useFooterChipColor } from "@/chat/ComposerFooter";
import { textColor, useScheme } from "@/ui/theme";

type Branch = { name: string; protected: boolean };

/**
 * The new-session base branch, as the web `BranchSelect` under the landing
 * composer: the branch icon, the branch and a chevron. It opens a sheet with
 * the web search ("Search branches...") over the repo's GitHub branches
 * (`github.listBranches`, read when the sheet first opens, as the web).
 */
export function BaseBranchChip({
  repoId,
  value,
  onChange,
  disabled,
}: {
  repoId: Id<"githubRepos">;
  value: string;
  onChange: (branch: string) => void;
  disabled?: boolean;
}) {
  const scheme = useScheme();
  const color = useFooterChipColor();
  const listBranches = useAction(api.github.listBranches);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Keyed by repo: a picked repo reads its own branches.
  const [loaded, setLoaded] = useState<{ repoId: Id<"githubRepos">; branches: Branch[] } | null>(null);
  const branches = loaded?.repoId === repoId ? loaded.branches : null;
  const query = search.trim().toLowerCase();
  const shown = (branches ?? []).filter((branch) => branch.name.toLowerCase().includes(query));

  const openSheet = () => {
    setOpen(true);
    if (branches !== null) return;
    listBranches({ repoId })
      .then((result) => setLoaded({ repoId, branches: result }))
      .catch(() => toast.error("Couldn't load branches"));
  };

  return (
    <>
      <PromptInputChip
        icon={<IconGitBranch size={PROMPT_INPUT_CHIP.iconSize} color={color} />}
        label={value || "Select a branch"}
        {...FOOTER_CHIP}
        color={color}
        accessibilityLabel={`Base branch: ${value || "none"}`}
        expanded={open}
        disabled={disabled}
        onPress={openSheet}
      />
      <FooterSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
        title="Base branch"
        header={
          <View className="px-2">
            <SearchInput size="md" value={search} onChange={setSearch} label="Search branches" placeholder="Search branches..." />
          </View>
        }
      >
        {branches === null ? (
          <View className="flex-row items-center justify-center gap-2 py-6">
            <Spinner size="sm" decorative />
            <Text variant="muted" style={textColor(scheme, "muted")}>
              Loading branches...
            </Text>
          </View>
        ) : shown.length === 0 ? (
          <Text variant="muted" className="py-6 text-center" style={textColor(scheme, "muted")}>
            No branch found.
          </Text>
        ) : (
          shown.map((branch) => (
            <SheetRow
              key={branch.name}
              icon={IconGitBranch}
              title={branch.name}
              active={branch.name === value}
              onPress={() => {
                onChange(branch.name);
                setOpen(false);
                setSearch("");
              }}
            />
          ))
        )}
      </FooterSheet>
    </>
  );
}

/**
 * The web `SandboxBranchChip`: read-only, the branch the sandbox worktree is
 * on while it runs. A tap copies it. When the worktree moved off the branch
 * Eva booted on, it is in the warning colour and says so to assistive tech
 * (the web says it in a hover tooltip, which a phone has not). Simple view
 * hides it, as the web: show it only outside Simple view.
 */
export function SandboxBranchChip({ branch, intendedBranch }: { branch: string; intendedBranch?: string }) {
  const scheme = useScheme();
  const muted = useFooterChipColor();
  const mismatched = intendedBranch !== undefined && intendedBranch !== branch;
  const color = mismatched ? EVA_THEME[scheme].warning : muted;
  return (
    <PromptInputChip
      icon={<IconGitBranch size={PROMPT_INPUT_CHIP.iconSize} color={color} />}
      label={branch}
      chevron={false}
      {...FOOTER_CHIP}
      color={color}
      accessibilityLabel={
        mismatched
          ? `Sandbox is on branch ${branch}. Chat branch is ${intendedBranch}. Copy branch name.`
          : `Sandbox is on branch ${branch}. Copy branch name.`
      }
      onPress={() => {
        void Clipboard.setStringAsync(branch).then(() => toast.success("Branch name copied"));
      }}
    />
  );
}

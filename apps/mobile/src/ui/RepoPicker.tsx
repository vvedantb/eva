import type { api, Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconBrandGithub, IconChevronDown } from "@tabler/icons-react-native";
import { SheetRow } from "@vvedantb/native-ui/primitives";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { FooterSheet } from "@/chat/ComposerFooter";
import { useScheme, XS_TRACKING } from "@/ui/theme";

type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];

/** A repo's name as the web shows it: its label, else its GitHub name. */
export function repoName(repo: Repo): string {
  return repo.label ?? repo.name;
}

/**
 * The repo a per-repo screen shows (the web reads it from the URL): the
 * GitHub mark, the name and a chevron, 44 high. It opens a bottom sheet of
 * the repos, in place of the web app switcher.
 */
export function RepoPicker({
  repos,
  value,
  onChange,
}: {
  repos: Repo[];
  value: Repo;
  onChange: (repoId: Id<"githubRepos">) => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Repo: ${repoName(value)}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        className="min-h-11 flex-row items-center gap-1.5 self-start active:opacity-70"
      >
        <IconBrandGithub size={16} color={theme.mutedForeground} />
        <Text
          numberOfLines={1}
          className="font-instrument-sans-medium shrink text-sm"
          style={{ color: theme.foreground, fontWeight: "500", letterSpacing: XS_TRACKING }}
        >
          {repoName(value)}
        </Text>
        <IconChevronDown size={14} color={theme.mutedForeground} />
      </Pressable>
      <FooterSheet open={open} onOpenChange={setOpen} title="Repo">
        {repos.map((repo) => (
          <SheetRow
            key={repo._id}
            icon={IconBrandGithub}
            title={repoName(repo)}
            active={repo._id === value._id}
            onPress={() => {
              onChange(repo._id);
              setOpen(false);
            }}
          />
        ))}
      </FooterSheet>
    </>
  );
}

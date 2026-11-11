import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconBrandGithub, IconChevronDown } from "@tabler/icons-react-native";
import { SheetRow } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { FooterSheet } from "@/chat/ComposerFooter";
import { RepoLogo } from "@/ui/RepoLogo";
import { useScheme, XS_TRACKING } from "@/ui/theme";

type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];

/**
 * The repo a per-repo section of the Sessions tab shows (Quick Tasks,
 * Reviews), kept in the URL (`?repo=`) as the web keeps it in its path, so
 * both sections stay on one repo. Default: the first repo.
 */
export function useRepoParam() {
  const router = useRouter();
  const { repo: repoParam } = useLocalSearchParams<{ repo?: string }>();
  const repos = useQuery(api.githubRepos.list, {});
  const repo = repos?.find((candidate) => candidate._id === repoParam) ?? repos?.[0];
  return {
    repos,
    repo,
    setRepo: (repoId: Id<"githubRepos">) => router.setParams({ repo: repoId }),
  };
}

/** A repo's name as the web shows it: its label, else its GitHub name. */
export function repoName(repo: Repo): string {
  return repo.label ?? repo.name;
}

/**
 * The repo a per-repo screen shows (the web reads it from the URL): its logo
 * (`RepoLogo`, else the GitHub mark), the name and a chevron, 44 high. It opens a bottom sheet of
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
        <RepoLogo logoUrl={value.logoUrl} size={16} fallback={<IconBrandGithub size={16} color={theme.mutedForeground} />} />
        <Text
          numberOfLines={1}
          className="font-instrument-sans-medium shrink text-sm"
          style={{ color: theme.foreground, fontWeight: "500", letterSpacing: XS_TRACKING }}
        >
          {repoName(value)}
        </Text>
        <IconChevronDown size={14} color={theme.mutedForeground} />
      </Pressable>
      <RepoSheet open={open} onOpenChange={setOpen} repos={repos} value={value} onChange={onChange} />
    </>
  );
}

/**
 * The bottom sheet of the user's repos (logo, else the GitHub mark, at the
 * row's 22 icon size, and the name; the current one checked); a pick closes it.
 */
export function RepoSheet({
  open,
  onOpenChange,
  repos,
  value,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repos: Repo[];
  value: Repo | undefined;
  onChange: (repoId: Id<"githubRepos">) => void;
}) {
  return (
    <FooterSheet open={open} onOpenChange={onOpenChange} title="Repo">
      {repos.map((repo) => (
        <SheetRow
          key={repo._id}
          icon={IconBrandGithub}
          leading={repo.logoUrl ? <RepoLogo logoUrl={repo.logoUrl} size={22} /> : undefined}
          title={repoName(repo)}
          active={repo._id === value?._id}
          onPress={() => {
            onChange(repo._id);
            onOpenChange(false);
          }}
        />
      ))}
    </FooterSheet>
  );
}

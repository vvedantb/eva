import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconBrandGithub, IconChevronDown, type IconProps } from "@tabler/icons-react-native";
import { EmptyState, SheetRow } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Fragment, useState, type ComponentType, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";
import { FooterSheet } from "@/chat/ComposerFooter";
import { jsonParser, persistedStore } from "@/storage/persistedStore";
import { RepoLogo } from "@/ui/RepoLogo";
import { useScheme, XS_TRACKING } from "@/ui/theme";

type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];

const ALL_REPOS = "All repos";

const lastRepo = persistedStore<string | null>("repo", null, jsonParser(z.string().nullable()));

/**
 * The repo last picked on this device. The web stays on a repo because its
 * path holds it (`/owner/repo/...`) and the browser reopens the last page; a
 * phone screen opened with no repo starts on this one instead of the first.
 */
export function useLastRepoId(): string | null {
  return lastRepo.useValue("last");
}

/** Remembers `repoId` as the repo to start on (`useLastRepoId`). */
export function rememberRepo(repoId: string) {
  lastRepo.set("last", repoId);
}

/**
 * The repo a per-repo section of a tab shows (Quick Tasks and Reviews in
 * Sessions; Projects, Documents, Automations and Today in Projects), kept in the
 * URL (`?repo=`) as the web keeps it in its path, so a tab's sections stay
 * on one repo. With none in the URL, the repo last picked (`useLastRepoId`),
 * else the first.
 */
export function useRepoParam() {
  const router = useRouter();
  const { repo: repoParam } = useLocalSearchParams<{ repo?: string }>();
  const repos = useQuery(api.githubRepos.list, {});
  const last = useLastRepoId();
  const repo =
    repos?.find((candidate) => candidate._id === repoParam) ?? repos?.find((candidate) => candidate._id === last) ?? repos?.[0];
  return {
    repos,
    repo,
    setRepo: (repoId: Id<"githubRepos">) => {
      rememberRepo(repoId);
      router.setParams({ repo: repoId });
    },
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
  onAll,
}: {
  repos: Repo[];
  /** Undefined is "All repos" (with `onAll`). */
  value: Repo | undefined;
  onChange: (repoId: Id<"githubRepos">) => void;
  /** Offers "All repos" first in the sheet (the Projects filter). */
  onAll?: () => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const [open, setOpen] = useState(false);
  const label = value ? repoName(value) : ALL_REPOS;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Repo: ${label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        className="min-h-11 flex-row items-center gap-1.5 self-start active:opacity-70"
      >
        {value ? (
          <RepoLogo logoUrl={value.logoUrl} size={16} fallback={<IconBrandGithub size={16} color={theme.mutedForeground} />} />
        ) : null}
        <Text
          numberOfLines={1}
          className="font-instrument-sans-medium shrink text-sm"
          style={{ color: theme.foreground, fontWeight: "500", letterSpacing: XS_TRACKING }}
        >
          {label}
        </Text>
        <IconChevronDown size={14} color={theme.mutedForeground} />
      </Pressable>
      <RepoSheet open={open} onOpenChange={setOpen} repos={repos} value={value} onChange={onChange} onAll={onAll} />
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
  onAll,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repos: Repo[];
  value: Repo | undefined;
  onChange: (repoId: Id<"githubRepos">) => void;
  /** Leads the sheet with "All repos", active while no repo is picked. */
  onAll?: () => void;
}) {
  return (
    <FooterSheet open={open} onOpenChange={onOpenChange} title="Repo">
      {onAll ? (
        <SheetRow
          icon={IconBrandGithub}
          title={ALL_REPOS}
          active={value === undefined}
          onPress={() => {
            onAll();
            onOpenChange(false);
          }}
        />
      ) : null}
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

/**
 * A per-repo section (`?repo=`, `useRepoParam`): `placeholder` while the
 * repos load, "No repos" with `icon` when there are none, else the picker
 * over `children` for the repo, keyed on it so its state starts fresh.
 */
export function RepoSection({
  icon,
  placeholder,
  children,
}: {
  icon: ComponentType<IconProps>;
  placeholder: ReactNode;
  children: (repo: Repo) => ReactNode;
}) {
  const { repos, repo, setRepo } = useRepoParam();
  if (repos === undefined) return placeholder;
  if (!repo) {
    return <EmptyState icon={icon} title="No repos" description="Connect a repo on the web. It shows up here." />;
  }
  return (
    <View className="flex-1">
      <View className="px-4">
        <RepoPicker repos={repos} value={repo} onChange={setRepo} />
      </View>
      <Fragment key={repo._id}>{children(repo)}</Fragment>
    </View>
  );
}

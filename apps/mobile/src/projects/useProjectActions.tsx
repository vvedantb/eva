import { api, type Id } from "@eva/backend";
import { ARCHIVE_LABEL, UNARCHIVE_LABEL, archiveCopy, entityHref, readableServerError } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconArchive,
  IconArchiveOff,
  IconClipboard,
  IconCopy,
  IconGitBranch,
  IconLink,
  IconUserPlus,
} from "@tabler/icons-react-native";
import { ConfirmDialog, SheetRow, MenuDivider, MenuSheet, SubmenuRow } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Clipboard from "expo-clipboard";
import { useState, type ReactNode } from "react";
import { Text } from "react-native";
import { WEB_URL } from "@/config";
import { userLabel } from "@/quickTasks/QuickTaskListOptions";
import { useScheme } from "@/ui/theme";

type User = FunctionReturnType<typeof api.users.listAll>[number];

/** The project fields the menu reads: a `projects.list` row or a `projects.get` result. */
export interface ProjectMenuTarget {
  _id: Id<"projects">;
  title: string;
  numId?: number;
  projectLead?: Id<"users">;
  branchName?: string;
  archivedAt?: number;
}

type Page = "root" | "lead" | "copy";

/**
 * The web project menu (`ProjectCardMenuItems`) on the phone: a long press
 * on a row, or the project header "…", opens it as a bottom sheet
 * (`openSheet`), with a page per web submenu: Project Lead and Copy
 * (Title, Link, Branch name), then Archive. Archive asks first, with the web
 * `ProjectArchiveDialog`, then offers Undo in its toast; `onArchived` runs
 * after. A refusal (a child task runs) toasts its reason. An archived project
 * offers only Copy and Unarchive.
 * The rest act at once. Writes are the web mutations. Render `dialogs` once.
 * Not here from the web menu: Edit details, Open in new tab and the PR submenus.
 */
export function useProjectActions({
  repo,
  users,
  onArchived,
  extraRows,
}: {
  extraRows?: (close: () => void) => ReactNode;
  repo: { owner: string; name: string; rootDirectory?: string };
  users: User[] | undefined;
  onArchived?: () => void;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const [target, setTarget] = useState<ProjectMenuTarget | null>(null);
  const [page, setPage] = useState<Page>("root");
  const [archiveTarget, setArchiveTarget] = useState<ProjectMenuTarget | null>(null);
  const currentUserId = useQuery(api.auth.me, {});
  const updateProject = useMutation(api.projects.update);
  const archiveProject = useMutation(api.projects.archive);
  const unarchiveProject = useMutation(api.projects.unarchive);
  const archiveText = archiveCopy("project");

  const close = () => {
    setTarget(null);
    setPage("root");
  };
  const act = (run: () => Promise<unknown>, failure: string) => {
    close();
    run().catch(() => toast.error(failure));
  };
  const copy = (text: string, success?: string) => {
    close();
    void Clipboard.setStringAsync(text).then(() => {
      if (success) toast.success(success);
    });
  };

  const unarchive = (projectId: Id<"projects">) => {
    unarchiveProject({ id: projectId }).then(
      () => toast.success(archiveText.unarchived, { id: "project-unarchive" }),
      () => toast.error(archiveText.unarchiveFailed, { id: "project-unarchive" }),
    );
  };
  const archive = (projectId: Id<"projects">) => {
    archiveProject({ id: projectId }).then(
      () => {
        toast.success(archiveText.archived, {
          id: "project-archive",
          action: { label: "Undo", onPress: () => unarchive(projectId) },
        });
        onArchived?.();
      },
      (error: Error) => toast.error(readableServerError(error, archiveText.archiveFailed), { id: "project-archive" }),
    );
  };

  const body = (project: ProjectMenuTarget) => {
    switch (page) {
      case "root":
        if (project.archivedAt !== undefined) {
          return (
            <>
              <SubmenuRow icon={IconCopy} title="Copy" onPress={() => setPage("copy")} />
              <MenuDivider />
              <SheetRow
                icon={IconArchiveOff}
                title={UNARCHIVE_LABEL}
                onPress={() => {
                  close();
                  unarchive(project._id);
                }}
              />
            </>
          );
        }
        return (
          <>
            {extraRows?.(close)}
            <SubmenuRow icon={IconUserPlus} title="Project Lead" onPress={() => setPage("lead")} />
            <MenuDivider />
            <SubmenuRow icon={IconCopy} title="Copy" onPress={() => setPage("copy")} />
            <MenuDivider />
            <SheetRow
              icon={IconArchive}
              title={ARCHIVE_LABEL}
              onPress={() => {
                close();
                setArchiveTarget(project);
              }}
            />
          </>
        );
      case "lead":
        return (
          <>
            {currentUserId ? (
              <>
                <SheetRow
                  title="Set myself as lead"
                  active={project.projectLead === currentUserId}
                  onPress={() => act(() => updateProject({ id: project._id, projectLead: currentUserId }), "Couldn't set the lead")}
                />
                <MenuDivider />
              </>
            ) : null}
            <SheetRow
              title="No lead"
              active={project.projectLead === undefined}
              onPress={() => act(() => updateProject({ id: project._id, projectLead: null }), "Couldn't set the lead")}
            />
            {(users ?? []).map((user) => (
              <SheetRow
                key={user._id}
                title={userLabel(user) ?? "Unknown"}
                active={project.projectLead === user._id}
                onPress={() => act(() => updateProject({ id: project._id, projectLead: user._id }), "Couldn't set the lead")}
              />
            ))}
          </>
        );
      case "copy":
        return (
          <>
            <SheetRow icon={IconClipboard} title="Title" onPress={() => copy(project.title)} />
            <SheetRow icon={IconLink} title="Link" onPress={() => copy(`${WEB_URL}${entityHref("project", repo, project.numId)}`)} />
            {project.branchName ? (
              <SheetRow icon={IconGitBranch} title="Branch name" onPress={() => copy(project.branchName ?? "", "Branch name copied")} />
            ) : null}
          </>
        );
    }
  };

  const titles: Record<Page, string> = {
    root: target?.title ?? "",
    lead: "Project Lead",
    copy: "Copy",
  };

  const dialogs = (
    <>
      <MenuSheet
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={titles[page]}
        onBack={page === "root" ? undefined : () => setPage("root")}
      >
        {target ? body(target) : null}
      </MenuSheet>
      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={archiveText.confirmTitle}
        description={
          <Text className="font-instrument-sans-semibold" style={{ fontWeight: "600", color: theme.foreground }}>
            {archiveTarget?.title}
          </Text>
        }
        confirmLabel={ARCHIVE_LABEL}
        onConfirm={() => {
          if (archiveTarget) archive(archiveTarget._id);
        }}
      />
    </>
  );

  return {
    openSheet: (project: ProjectMenuTarget) => {
      setPage("root");
      setTarget(project);
    },
    unarchive,
    dialogs,
  };
}

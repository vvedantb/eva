import { PROJECT_PHASES, api, type Id } from "@eva/backend";
import { PROJECT_PHASE_LABELS, entityHref, type ProjectPhase } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconClipboard, IconCopy, IconGitBranch, IconLink, IconTrash, IconUserPlus } from "@tabler/icons-react-native";
import { ConfirmDialog, SheetRow } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Text } from "react-native";
import { WEB_URL } from "@/config";
import { phaseAppearance } from "@/projects/phaseAppearance";
import { userLabel } from "@/quickTasks/QuickTaskListOptions";
import { MenuDivider, MenuSheet, SubmenuRow } from "@/ui/MenuSheet";
import { useScheme } from "@/ui/theme";

type User = FunctionReturnType<typeof api.users.listAll>[number];

/** The project fields the menu reads: a `projects.list` row or a `projects.get` result. */
export interface ProjectMenuTarget {
  _id: Id<"projects">;
  title: string;
  phase: ProjectPhase;
  numId?: number;
  projectLead?: Id<"users">;
  branchName?: string;
}

type Page = "root" | "phase" | "lead" | "copy";

/**
 * The web project menu (`ProjectCardMenuItems`) on the phone: a long press
 * on a row, or the project header "…", opens it as a bottom sheet
 * (`openSheet`), with a page per web submenu: Phase, Project Lead and Copy
 * (Title, Link, Branch name), then Delete. Delete asks first, with the web
 * `ProjectDeleteDialog`, and has no Undo, as the web (`deleteCascade`
 * deletes the tasks too and nothing restores them); `onDeleted` runs after.
 * The rest act at once. Writes are the web mutations. Render `dialogs` once.
 * Not here from the web menu: Edit details, Open in new tab and the PR submenus.
 */
export function useProjectActions({
  repo,
  users,
  onDeleted,
}: {
  /** The repo's path fields, for Copy link. */
  repo: { owner: string; name: string; rootDirectory?: string };
  users: User[] | undefined;
  onDeleted?: () => void;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const [target, setTarget] = useState<ProjectMenuTarget | null>(null);
  const [page, setPage] = useState<Page>("root");
  const [deleteTarget, setDeleteTarget] = useState<ProjectMenuTarget | null>(null);
  const currentUserId = useQuery(api.auth.me, {});
  const updateProject = useMutation(api.projects.update);
  const deleteProject = useMutation(api.projects.deleteCascade);

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

  const body = (project: ProjectMenuTarget) => {
    switch (page) {
      case "root":
        return (
          <>
            <SubmenuRow icon={phaseAppearance(project.phase, scheme).icon} title="Phase" onPress={() => setPage("phase")} />
            <SubmenuRow icon={IconUserPlus} title="Project Lead" onPress={() => setPage("lead")} />
            <MenuDivider />
            <SubmenuRow icon={IconCopy} title="Copy" onPress={() => setPage("copy")} />
            <MenuDivider />
            <SheetRow
              icon={IconTrash}
              title="Delete"
              danger
              onPress={() => {
                close();
                setDeleteTarget(project);
              }}
            />
          </>
        );
      case "phase":
        return PROJECT_PHASES.map((phase) => {
          const { icon: Icon, text } = phaseAppearance(phase, scheme);
          return (
            <SheetRow
              key={phase}
              leading={<Icon size={20} color={text} />}
              title={PROJECT_PHASE_LABELS[phase]}
              active={project.phase === phase}
              onPress={() => act(() => updateProject({ id: project._id, phase }), "Couldn't change the phase")}
            />
          );
        });
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
    phase: "Phase",
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
      {/* The web `ProjectDeleteDialog` (one project). */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Project"
        description={
          // The web body: the question, the warning (its tinted box is plain warning text here), then the note.
          <>
            Are you sure you want to delete{" "}
            <Text className="font-instrument-sans-semibold" style={{ fontWeight: "600", color: theme.foreground }}>
              {deleteTarget?.title}
            </Text>
            ?
            <Text style={{ color: theme.warning }}>
              {"\n\nThis will permanently delete the project and all associated tasks, agent runs, and dependencies."}
            </Text>
            {"\n\nThis action cannot be undone."}
          </>
        }
        confirmLabel="Delete Project"
        variant="destructive"
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteProject({ id: deleteTarget._id })
            .then(() => {
              toast.success("Project deleted");
              onDeleted?.();
            })
            .catch(() => toast.error("Couldn't delete project"));
        }}
      />
    </>
  );

  return {
    /** Opens the project menu (the web right-click, kebab and header "…" menu). */
    openSheet: (project: ProjectMenuTarget) => {
      setPage("root");
      setTarget(project);
    },
    dialogs,
  };
}

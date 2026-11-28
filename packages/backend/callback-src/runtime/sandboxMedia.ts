/** Repo-root + optional app subdirectory (e.g. apps/eprocurement). */
export function mediaCandidateRoots(
  workDir: string,
  rootDirectory: string | null | undefined,
): string[] {
  const roots = [workDir];
  const trimmed = rootDirectory?.trim() ?? "";
  if (
    trimmed.length > 0 &&
    trimmed !== "." &&
    !trimmed.startsWith("/") &&
    !trimmed.includes("..")
  ) {
    const appRoot = `${workDir}/${trimmed.replace(/\/+$/, "")}`;
    if (appRoot !== workDir) {
      roots.push(appRoot);
    }
  }
  return roots;
}

export function mediaSearchDirs(
  workDir: string,
  rootDirectory: string | null | undefined,
): { recordings: string[]; screenshots: string[] } {
  const roots = mediaCandidateRoots(workDir, rootDirectory);
  return {
    recordings: roots.map((root) => `${root}/recordings`),
    screenshots: roots.map((root) => `${root}/screenshots`),
  };
}

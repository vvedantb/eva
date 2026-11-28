import { z } from "zod";
import type { getInstallationOctokit } from "../githubAuth";
import {
  decodeGitHubContent,
  decodeGitHubContentBytes,
  githubContentContainsNul,
} from "../_repoSkills/decodeGitHubContent";

type InstallationOctokit = Awaited<ReturnType<typeof getInstallationOctokit>>;

export type BlobResult = {
  contents: string | null;
  skipped: null | "too-large" | "binary";
};

const fileContentsSchema = z.object({
  type: z.literal("file"),
  encoding: z.string(),
  content: z.string(),
  size: z.number(),
});

const requestErrorSchema = z.object({ status: z.number() });

/**
 * Reads one text file at one ref (branch or sha). A missing file is not an
 * error: 404 — and a ref GitHub does not have yet — maps to `null` contents.
 */
export async function readFileAtRef(
  octokit: InstallationOctokit,
  args: {
    owner: string;
    name: string;
    path: string;
    ref: string;
    maxBytes: number;
  },
): Promise<BlobResult> {
  let file: z.infer<typeof fileContentsSchema>;
  try {
    const res = await octokit.rest.repos.getContent({
      owner: args.owner,
      repo: args.name,
      path: args.path,
      ref: args.ref,
    });
    const parsed = fileContentsSchema.safeParse(res.data);
    if (!parsed.success) return { contents: null, skipped: null };
    file = parsed.data;
  } catch (error) {
    const parsed = requestErrorSchema.safeParse(error);
    if (parsed.success && parsed.data.status === 404) {
      return { contents: null, skipped: null };
    }
    if (parsed.success && parsed.data.status === 403) {
      return { contents: null, skipped: "too-large" };
    }
    throw error;
  }

  if (file.size > args.maxBytes) {
    return { contents: null, skipped: "too-large" };
  }

  const bytes = decodeGitHubContentBytes(file.content);
  if (githubContentContainsNul(bytes)) {
    return { contents: null, skipped: "binary" };
  }

  return { contents: decodeGitHubContent(file.content), skipped: null };
}

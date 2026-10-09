import { writeFileSync } from "fs";
import { fetchWithTimeout } from "../http/convexClient.js";
import { log, errorText } from "../utils.js";

/** Mirrors attachmentExtensionForMimeType in convex/_sandbox_runtime/attachments.ts. */
function attachmentExtensionForMimeType(mimeType: string): string {
  const type = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  switch (type) {
    case "image/jpeg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    case "image/png":
      return ".png";
    case "text/html":
      return ".html";
    case "text/markdown":
      return ".md";
    case "text/plain":
      return ".txt";
    default:
      return type.startsWith("image/") ? ".png" : ".bin";
  }
}

/**
 * Downloads a claimed turn's input attachments into the sandbox filesystem and
 * appends a note pointing the agent at them, so the prompt references files
 * that already exist on disk (no race — the daemon owns ordering). Uses the
 * same flat `/tmp/eva-attachment-<n>.<ext>` scheme and note text as the CLI
 * launch path (convex/_sandbox_runtime/attachments.ts). Failed downloads are
 * skipped rather than failing the turn. Shared by every provider daemon.
 */
export async function materializeTurnAttachments(turn: {
  prompt: string;
  attachmentUrls: string[];
}): Promise<void> {
  if (turn.attachmentUrls.length === 0) return;
  const paths: string[] = [];
  for (let index = 0; index < turn.attachmentUrls.length; index++) {
    const url = turn.attachmentUrls[index];
    if (!url) continue;
    try {
      const response = await fetchWithTimeout(url, { method: "GET" });
      if (!response.ok) {
        log(`daemon: attachment download failed status=${response.status}`);
        continue;
      }
      const path = `/tmp/eva-attachment-${index}${attachmentExtensionForMimeType(
        response.headers.get("content-type") ?? "",
      )}`;
      writeFileSync(path, new Uint8Array(await response.arrayBuffer()));
      paths.push(path);
    } catch (error) {
      log(`daemon: attachment download error ${errorText(error)}`);
    }
  }
  if (paths.length === 0) return;
  turn.prompt +=
    "\n\n---\nThe user attached the following file(s). Read them with your file-reading tool before responding:\n" +
    paths.map((path) => `- ${path}`).join("\n");
}

import { z } from "zod";

// The cowork-artifact-meta manifest embedded in a Cowork artifact's HTML. Extra
// keys (schemaVersion, mcpServerNames, …) are ignored by the non-strict schema.
const metaSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  mcpTools: z.array(z.string()).optional(),
});

export interface ParsedArtifactMeta {
  name: string;
  description: string;
  declaredTools: string[];
}

/** Reads the cowork-artifact-meta manifest from an artifact's HTML, with fallbacks. */
export function parseArtifactMeta(
  html: string,
  fallbackName: string,
): ParsedArtifactMeta {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const raw = doc.getElementById("cowork-artifact-meta")?.textContent?.trim();
  if (!raw) {
    return { name: fallbackName, description: "", declaredTools: [] };
  }
  try {
    const meta = metaSchema.parse(JSON.parse(raw));
    return {
      name: meta.name ?? fallbackName,
      description: meta.description ?? "",
      declaredTools: meta.mcpTools ?? [],
    };
  } catch {
    return { name: fallbackName, description: "", declaredTools: [] };
  }
}

export { parseStorageId } from "@eva/shared/storageUpload";

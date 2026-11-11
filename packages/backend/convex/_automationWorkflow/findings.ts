import { z } from "zod";
import { FINDING_SEVERITIES, type FindingSeverity } from "../_validators/enums";

export interface ParsedFinding {
  id: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  filePaths?: string[];
  suggestedFix?: string;
}

// Boundary schema for one finding in the LLM's FINDINGS_JSON block. Any item
// that fails validation (missing fields, bad severity) becomes null via
// `.catch(null)` and is skipped, preserving the original per-item behaviour.
const findingItemSchema = z.object({
  title: z.string(),
  description: z.string(),
  severity: z.enum(FINDING_SEVERITIES),
  filePaths: z.array(z.string()).optional().catch(undefined),
  suggestedFix: z.string().optional().catch(undefined),
});

const findingsArraySchema = z.array(findingItemSchema.nullable().catch(null));

/** Extracts structured findings from the FINDINGS_JSON marker in the LLM result text. */
export function parseFindingsFromResult(
  resultText: string,
): ParsedFinding[] | null {
  const markerIdx = resultText.indexOf("<!-- FINDINGS_JSON -->");
  if (markerIdx === -1) return null;

  const afterMarker = resultText.slice(markerIdx);
  const jsonMatch = afterMarker.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return null;

  try {
    const parsed = findingsArraySchema.safeParse(
      JSON.parse(jsonMatch[1].trim()),
    );
    if (!parsed.success) return null;

    // Map before filtering so the `finding-${i}` id keeps the original array
    // index even when earlier items were skipped.
    const findings: ParsedFinding[] = parsed.data
      .map((item, i): ParsedFinding | null => {
        if (!item) return null;
        const finding: ParsedFinding = {
          id: `finding-${String(i)}`,
          title: item.title,
          description: item.description,
          severity: item.severity,
        };
        if (item.filePaths) finding.filePaths = item.filePaths;
        if (item.suggestedFix) finding.suggestedFix = item.suggestedFix;
        return finding;
      })
      .filter((f): f is ParsedFinding => f !== null);

    return findings.length > 0 ? findings : null;
  } catch {
    return null;
  }
}

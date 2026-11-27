import { z } from "zod";
import { AI_PROVIDERS } from "../_validators/aiModels";

const MAX_COMMANDS = 100;
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ARGUMENT_HINT_LENGTH = 400;
const MAX_CLI_VERSION_LENGTH = 64;
const MAX_SKILLS_JSON_LENGTH = 200_000;

const commandsSchema = z
  .array(
    z.object({
      name: z.string().min(1).max(MAX_NAME_LENGTH),
      description: z.string().max(MAX_DESCRIPTION_LENGTH),
      argumentHint: z.string().max(MAX_ARGUMENT_HINT_LENGTH).optional(),
    }),
  )
  .min(1)
  .max(MAX_COMMANDS);

const fieldsSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  cliVersion: z.string().min(1).max(MAX_CLI_VERSION_LENGTH),
  skillsJson: z.string().min(1).max(MAX_SKILLS_JSON_LENGTH),
});

type ParsedFields = z.infer<typeof fieldsSchema>;
type ParsedCommands = z.infer<typeof commandsSchema>;

export type HarnessCatalogReport = {
  provider: ParsedFields["provider"];
  cliVersion: ParsedFields["cliVersion"];
  commands: ParsedCommands;
};

function decodeCommands(skillsJson: string): ParsedCommands | null {
  try {
    const parsed = commandsSchema.safeParse(JSON.parse(skillsJson));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Parses the form fields of a catalog report at the HTTP boundary. Returns null
 * for anything malformed so the route answers 400 instead of throwing into the
 * mutation. The mutation's own filter still runs as defense in depth.
 */
export function parseHarnessCatalogReport(fields: {
  provider: string | null;
  cliVersion: string | null;
  skillsJson: string | null;
}): HarnessCatalogReport | null {
  const parsed = fieldsSchema.safeParse(fields);
  if (!parsed.success) return null;
  const commands = decodeCommands(parsed.data.skillsJson);
  if (!commands) return null;
  return {
    provider: parsed.data.provider,
    cliVersion: parsed.data.cliVersion,
    commands,
  };
}

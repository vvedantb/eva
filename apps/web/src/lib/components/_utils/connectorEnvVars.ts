import { CONNECTOR_ENV_KEYS } from "@eva/backend";
import { FigmaLogo, LinearLogo } from "@/lib/components/ui/providerLogos";
import type { EnvVarSlotEntry } from "./envVarSlotTypes";

/** Team/repo paste-in slots for Linear and Figma — the env-key fallback. */
export const CONNECTOR_ENV_VARS: ReadonlyArray<EnvVarSlotEntry> = [
  {
    id: "linear",
    label: "Linear",
    primaryKey: CONNECTOR_ENV_KEYS.linear[0],
    matchKeys: CONNECTOR_ENV_KEYS.linear,
    Logo: LinearLogo,
    hint: "Personal API key. Used when nobody has connected Linear via OAuth. Prefer Settings → Connections.",
    placeholder: "lin_api_...",
    multiline: false,
  },
  {
    id: "figma",
    label: "Figma",
    primaryKey: CONNECTOR_ENV_KEYS.figma[0],
    matchKeys: CONNECTOR_ENV_KEYS.figma,
    Logo: FigmaLogo,
    hint: "Personal access token. Official Figma MCP rejects PATs; this powers REST / community tools. Prefer Settings → Connections.",
    placeholder: "figd_...",
    multiline: false,
  },
];

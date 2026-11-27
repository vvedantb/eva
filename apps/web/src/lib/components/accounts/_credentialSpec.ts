import {
  PROVIDER_CONFIG_KEY,
  PROVIDER_PRIMARY_AUTH_KEY,
  type AIProvider,
} from "@eva/backend";

/** A single credential field a provider account collects. */
export interface CredentialFieldSpec {
  key: string;
  label: string;
  required: boolean;
  /** Render as a multi-line textarea (JSON/TOML blobs) instead of an input. */
  multiline?: boolean;
  placeholder?: string;
}

/**
 * The credential fields collected per provider account. The primary field is
 * the agent's auth secret; optional fields carry provider config. Keys match
 * the env vars the in-sandbox runner reads (see callback-src/config.ts).
 */
export const PROVIDER_CREDENTIAL_FIELDS: Record<
  AIProvider,
  ReadonlyArray<CredentialFieldSpec>
> = {
  claude: [
    {
      key: PROVIDER_PRIMARY_AUTH_KEY.claude,
      label: "OAuth token",
      required: true,
      placeholder: "sk-ant-oat...",
    },
  ],
  cursor: [
    {
      key: PROVIDER_PRIMARY_AUTH_KEY.cursor,
      label: "API key",
      required: true,
      placeholder: "key_...",
    },
  ],
  codex: [
    {
      key: PROVIDER_PRIMARY_AUTH_KEY.codex,
      label: "auth.json",
      required: true,
      multiline: true,
      placeholder: '{"OPENAI_API_KEY":"sk-..."}',
    },
    {
      key: PROVIDER_CONFIG_KEY.codex,
      label: "config.toml (optional)",
      required: false,
      multiline: true,
    },
  ],
  opencode: [
    {
      key: PROVIDER_PRIMARY_AUTH_KEY.opencode,
      label: "auth.json",
      required: true,
      multiline: true,
    },
    {
      key: PROVIDER_CONFIG_KEY.opencode,
      label: "config.json (optional)",
      required: false,
      multiline: true,
    },
  ],
};

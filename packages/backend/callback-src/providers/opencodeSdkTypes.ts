/**
 * Narrow, hand-written mirrors of the `@opencode-ai/sdk` surface the runner
 * touches.
 *
 * The SDK is loaded by dynamic import from the sandbox's global npm root (it is
 * never bundled), and the repo carries no dependency on it — mirroring the
 * Claude Agent SDK loader. These declarations therefore describe the wire
 * contract we rely on rather than re-exporting the package's generated types.
 *
 * Deliberately partial: parts and messages carry many more fields, and they
 * ride along untouched because the runner re-serializes whole objects rather
 * than rebuilding them. Only fields the runner reads are declared. Kept in
 * lockstep with the CLI/SDK pin (SDK_VERSION in opencodeSdk.ts).
 */

type OpencodeTokens = {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
};

/** Every opencode `NamedError` shares this shape (`{name, data:{message}}`). */
export type OpencodeNamedError = {
  name: string;
  data?: { message?: string };
};

type OpencodePartBase = {
  id: string;
  sessionID: string;
  messageID: string;
};

type OpencodeTextPart = OpencodePartBase & {
  type: "text";
  text: string;
};

type OpencodeReasoningPart = OpencodePartBase & {
  type: "reasoning";
  text: string;
};

type OpencodeToolPart = OpencodePartBase & {
  type: "tool";
  callID: string;
  tool: string;
  /** `input`/`output`/`error`/`metadata`/`time` also ride here and are read
   * downstream by opencodeToolToStep and probeOpencodeStateResult. */
  state: { status: string };
};

type OpencodeStepStartPart = OpencodePartBase & { type: "step-start" };

type OpencodeStepFinishPart = OpencodePartBase & {
  type: "step-finish";
  reason: string;
  cost: number;
  tokens: OpencodeTokens;
};

/** Parts the runner forwards nothing for (file, subtask, snapshot, agent, …). */
type OpencodeOpaquePart = OpencodePartBase & { type: OpaquePartType };
type OpaquePartType =
  | "file"
  | "subtask"
  | "snapshot"
  | "patch"
  | "agent"
  | "retry"
  | "compaction";

export type OpencodePart =
  | OpencodeTextPart
  | OpencodeReasoningPart
  | OpencodeToolPart
  | OpencodeStepStartPart
  | OpencodeStepFinishPart
  | OpencodeOpaquePart;

export type OpencodeAssistantMessage = {
  id: string;
  sessionID: string;
  role: "assistant";
  modelID: string;
  providerID: string;
  cost: number;
  tokens: OpencodeTokens;
  error?: OpencodeNamedError;
};

type OpencodeUserMessage = {
  id: string;
  sessionID: string;
  role: "user";
};

type OpencodeMessage = OpencodeAssistantMessage | OpencodeUserMessage;

type OpencodeSession = {
  id: string;
  version: string;
};

/**
 * The `/event` stream carries ~30 event types. Rather than mirror all of them,
 * this models what is actually guaranteed — a `type` plus a `properties` bag —
 * and declares the four members the runner reads. New server event types stay
 * representable instead of breaking the build.
 */
export type OpencodeEvent = {
  type: string;
  properties?: {
    part?: OpencodePart;
    info?: OpencodeMessage;
    sessionID?: string;
    error?: OpencodeNamedError;
  };
};

/** hey-api result envelope (the client is created without `throwOnError`). */
export type OpencodeResult<TData> = {
  data?: TData;
  error?: OpencodeNamedError;
  response?: { ok: boolean; status: number };
};

type OpencodePromptBody = {
  model?: { providerID: string; modelID: string };
  parts: Array<{ type: "text"; text: string }>;
};

/** `McpRemoteConfig` — the streamable-HTTP half of opencode's `mcp` config. */
export type OpencodeMcpRemoteConfig = {
  type: "remote";
  url: string;
  headers: Record<string, string>;
  enabled: boolean;
};

/** `McpLocalConfig` — a stdio server opencode spawns itself. */
export type OpencodeMcpLocalConfig = {
  type: "local";
  command: string[];
  environment: Record<string, string>;
  enabled: boolean;
};

/** `McpStatus` union; every member carries the discriminant the runner reads. */
type OpencodeMcpStatus = { status: string };

export type OpencodeClientLike = {
  mcp: {
    status: () => Promise<
      OpencodeResult<Record<string, OpencodeMcpStatus | undefined>>
    >;
    add: (options: {
      body: {
        name: string;
        config: OpencodeMcpRemoteConfig | OpencodeMcpLocalConfig;
      };
    }) => Promise<
      OpencodeResult<Record<string, OpencodeMcpStatus | undefined>>
    >;
  };
  session: {
    create: () => Promise<OpencodeResult<OpencodeSession>>;
    get: (options: {
      path: { id: string };
    }) => Promise<OpencodeResult<OpencodeSession>>;
    status: () => Promise<
      OpencodeResult<Record<string, { type: string } | undefined>>
    >;
    abort: (options: {
      path: { id: string };
    }) => Promise<OpencodeResult<boolean>>;
    promptAsync: (options: {
      path: { id: string };
      body: OpencodePromptBody;
    }) => Promise<OpencodeResult<null>>;
    message: (options: {
      path: { id: string; messageID: string };
    }) => Promise<
      OpencodeResult<{ info: OpencodeMessage; parts: OpencodePart[] }>
    >;
  };
  event: {
    subscribe: (options?: {
      signal?: AbortSignal;
    }) => Promise<{ stream: AsyncIterable<OpencodeEvent> }>;
  };
};

export type OpencodeSdkModule = {
  createOpencodeClient: (config: {
    baseUrl: string;
    directory?: string;
  }) => OpencodeClientLike;
};

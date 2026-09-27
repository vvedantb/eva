import { v } from "convex/values";
import { z } from "zod";
import { action } from "./_generated/server";
import { boat, sandboxPath } from "./api";
import { requireLinked } from "./lifecycle";

const identity = { ownerId: v.string(), key: v.string() };

const exitCode = z
  .number()
  .nullish()
  .transform((code) => code ?? null);
const output = z
  .string()
  .nullish()
  .transform((text) => text ?? "");

const commandResponse = z.object({
  exitCode,
  stdout: output,
  stderr: output,
  timedOut: z
    .boolean()
    .optional()
    .transform((flag) => flag ?? false),
  oomKilled: z.boolean().optional(),
  stdoutTruncated: z.boolean().optional(),
  stderrTruncated: z.boolean().optional(),
});

/** Run a shell command and wait for it (up to 600 s, Boat's cap). */
export const exec = action({
  args: {
    ...identity,
    command: v.string(),
    cwd: v.optional(v.string()),
    timeoutSeconds: v.optional(v.number()),
  },
  returns: v.object({
    exitCode: v.union(v.number(), v.null()),
    stdout: v.string(),
    stderr: v.string(),
    timedOut: v.boolean(),
    oomKilled: v.optional(v.boolean()),
    stdoutTruncated: v.optional(v.boolean()),
    stderrTruncated: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const { sandboxId } = await requireLinked(ctx, args.ownerId, args.key);
    return await boat(
      commandResponse,
      "POST",
      sandboxPath(sandboxId, "/commands"),
      {
        body: {
          command: args.command,
          cwd: args.cwd,
          timeoutSeconds: args.timeoutSeconds,
        },
      },
    );
  },
});

/** Start a long-running command (dev server, build) in the background; poll it with `commandStatus`. */
export const spawn = action({
  args: { ...identity, command: v.string(), cwd: v.optional(v.string()) },
  returns: v.object({ processId: v.number() }),
  handler: async (ctx, args) => {
    const { sandboxId } = await requireLinked(ctx, args.ownerId, args.key);
    return await boat(
      z.object({ processId: z.number() }),
      "POST",
      sandboxPath(sandboxId, "/commands"),
      { body: { command: args.command, cwd: args.cwd, detached: true } },
    );
  },
});

export const commandStatus = action({
  args: {
    ...identity,
    processId: v.number(),
    tailBytes: v.optional(v.number()),
  },
  returns: v.object({
    status: v.string(),
    running: v.boolean(),
    exitCode: v.union(v.number(), v.null()),
    stdout: v.string(),
    stderr: v.string(),
  }),
  handler: async (ctx, args) => {
    const { sandboxId } = await requireLinked(ctx, args.ownerId, args.key);
    const query = args.tailBytes
      ? `?tailBytes=${Math.floor(args.tailBytes)}`
      : "";
    return await boat(
      z.object({
        status: z.string(),
        running: z.boolean(),
        exitCode,
        stdout: output,
        stderr: output,
      }),
      "GET",
      sandboxPath(sandboxId, `/commands/${Math.floor(args.processId)}${query}`),
    );
  },
});

const encoding = v.optional(v.union(v.literal("utf8"), v.literal("base64")));

/** Paths resolve under /home/user (relative) or /tmp. */
export const readFile = action({
  args: { ...identity, path: v.string(), encoding },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { sandboxId } = await requireLinked(ctx, args.ownerId, args.key);
    const params = new URLSearchParams({
      path: args.path,
      encoding: args.encoding ?? "utf8",
    });
    const { content } = await boat(
      z.object({ content: z.string() }),
      "GET",
      sandboxPath(sandboxId, `/files?${params}`),
    );
    return content;
  },
});

export const writeFile = action({
  args: { ...identity, path: v.string(), content: v.string(), encoding },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { sandboxId } = await requireLinked(ctx, args.ownerId, args.key);
    await boat(z.object({}), "PUT", sandboxPath(sandboxId, "/files"), {
      body: {
        path: args.path,
        content: args.content,
        encoding: args.encoding ?? "utf8",
      },
    });
    return null;
  },
});

/** Public HTTPS URL for a port inside the sandbox. Token-gated unless `public: true`. */
export const host = action({
  args: { ...identity, port: v.number(), public: v.optional(v.boolean()) },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    const { sandboxId } = await requireLinked(ctx, args.ownerId, args.key);
    return await boat(
      z.object({ url: z.string() }),
      "POST",
      sandboxPath(sandboxId, "/host"),
      { body: { port: args.port, public: args.public ?? false } },
    );
  },
});

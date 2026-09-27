/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    exec: {
      commandStatus: FunctionReference<
        "action",
        "internal",
        { key: string; ownerId: string; processId: number; tailBytes?: number },
        {
          exitCode: number | null;
          running: boolean;
          status: string;
          stderr: string;
          stdout: string;
        },
        Name
      >;
      exec: FunctionReference<
        "action",
        "internal",
        {
          command: string;
          cwd?: string;
          key: string;
          ownerId: string;
          timeoutSeconds?: number;
        },
        {
          exitCode: number | null;
          oomKilled?: boolean;
          stderr: string;
          stderrTruncated?: boolean;
          stdout: string;
          stdoutTruncated?: boolean;
          timedOut: boolean;
        },
        Name
      >;
      host: FunctionReference<
        "action",
        "internal",
        { key: string; ownerId: string; port: number; public?: boolean },
        { url: string },
        Name
      >;
      readFile: FunctionReference<
        "action",
        "internal",
        {
          encoding?: "utf8" | "base64";
          key: string;
          ownerId: string;
          path: string;
        },
        string,
        Name
      >;
      spawn: FunctionReference<
        "action",
        "internal",
        { command: string; cwd?: string; key: string; ownerId: string },
        { processId: number },
        Name
      >;
      writeFile: FunctionReference<
        "action",
        "internal",
        {
          content: string;
          encoding?: "utf8" | "base64";
          key: string;
          ownerId: string;
          path: string;
        },
        null,
        Name
      >;
    };
    lifecycle: {
      create: FunctionReference<
        "action",
        "internal",
        {
          key: string;
          options?: {
            env?: Record<string, string>;
            environment?: string;
            from?: string;
            name?: string;
            noEnv?: boolean;
            setupScript?: string;
            ttlSeconds?: number | null;
            type?: "small" | "default" | "large";
          };
          ownerId: string;
        },
        {
          key: string;
          lastError?: string;
          ownerId: string;
          sandbox?: {
            archiveAfter?: string | null;
            createdAt?: string | null;
            id: string;
            ip?: string | null;
            name: string;
            setupError?: string | null;
            setupStatus?: string | null;
            snapshotAvailable?: boolean;
            snapshotCompletedAt?: string | null;
            state: string;
            subdomain?: string | null;
            type?: string;
            updatedAt?: string | null;
            url?: string | null;
          };
          sandboxId?: string;
          state: string;
          updatedAt: number;
        },
        Name
      >;
      destroy: FunctionReference<
        "action",
        "internal",
        { key: string; ownerId: string },
        null,
        Name
      >;
      fork: FunctionReference<
        "action",
        "internal",
        {
          key: string;
          newKey: string;
          options?: {
            env?: Record<string, string>;
            environment?: string;
            noEnv?: boolean;
            ttlSeconds?: number | null;
            type?: "small" | "default" | "large";
          };
          ownerId: string;
        },
        {
          key: string;
          lastError?: string;
          ownerId: string;
          sandbox?: {
            archiveAfter?: string | null;
            createdAt?: string | null;
            id: string;
            ip?: string | null;
            name: string;
            setupError?: string | null;
            setupStatus?: string | null;
            snapshotAvailable?: boolean;
            snapshotCompletedAt?: string | null;
            state: string;
            subdomain?: string | null;
            type?: string;
            updatedAt?: string | null;
            url?: string | null;
          };
          sandboxId?: string;
          state: string;
          updatedAt: number;
        },
        Name
      >;
      refresh: FunctionReference<
        "action",
        "internal",
        { key: string; ownerId: string },
        {
          key: string;
          lastError?: string;
          ownerId: string;
          sandbox?: {
            archiveAfter?: string | null;
            createdAt?: string | null;
            id: string;
            ip?: string | null;
            name: string;
            setupError?: string | null;
            setupStatus?: string | null;
            snapshotAvailable?: boolean;
            snapshotCompletedAt?: string | null;
            state: string;
            subdomain?: string | null;
            type?: string;
            updatedAt?: string | null;
            url?: string | null;
          };
          sandboxId?: string;
          state: string;
          updatedAt: number;
        },
        Name
      >;
      resume: FunctionReference<
        "action",
        "internal",
        {
          key: string;
          options?: {
            env?: Record<string, string>;
            environment?: string;
            noEnv?: boolean;
            ttlSeconds?: number | null;
            type?: "small" | "default" | "large";
          };
          ownerId: string;
        },
        {
          key: string;
          lastError?: string;
          ownerId: string;
          sandbox?: {
            archiveAfter?: string | null;
            createdAt?: string | null;
            id: string;
            ip?: string | null;
            name: string;
            setupError?: string | null;
            setupStatus?: string | null;
            snapshotAvailable?: boolean;
            snapshotCompletedAt?: string | null;
            state: string;
            subdomain?: string | null;
            type?: string;
            updatedAt?: string | null;
            url?: string | null;
          };
          sandboxId?: string;
          state: string;
          updatedAt: number;
        },
        Name
      >;
      stop: FunctionReference<
        "action",
        "internal",
        { force?: boolean; key: string; ownerId: string },
        {
          key: string;
          lastError?: string;
          ownerId: string;
          sandbox?: {
            archiveAfter?: string | null;
            createdAt?: string | null;
            id: string;
            ip?: string | null;
            name: string;
            setupError?: string | null;
            setupStatus?: string | null;
            snapshotAvailable?: boolean;
            snapshotCompletedAt?: string | null;
            state: string;
            subdomain?: string | null;
            type?: string;
            updatedAt?: string | null;
            url?: string | null;
          };
          sandboxId?: string;
          state: string;
          updatedAt: number;
        },
        Name
      >;
    };
    sandboxes: {
      get: FunctionReference<
        "query",
        "internal",
        { key: string; ownerId: string },
        {
          key: string;
          lastError?: string;
          ownerId: string;
          sandbox?: {
            archiveAfter?: string | null;
            createdAt?: string | null;
            id: string;
            ip?: string | null;
            name: string;
            setupError?: string | null;
            setupStatus?: string | null;
            snapshotAvailable?: boolean;
            snapshotCompletedAt?: string | null;
            state: string;
            subdomain?: string | null;
            type?: string;
            updatedAt?: string | null;
            url?: string | null;
          };
          sandboxId?: string;
          state: string;
          updatedAt: number;
        } | null,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { limit?: number; ownerId: string },
        Array<{
          key: string;
          lastError?: string;
          ownerId: string;
          sandbox?: {
            archiveAfter?: string | null;
            createdAt?: string | null;
            id: string;
            ip?: string | null;
            name: string;
            setupError?: string | null;
            setupStatus?: string | null;
            snapshotAvailable?: boolean;
            snapshotCompletedAt?: string | null;
            state: string;
            subdomain?: string | null;
            type?: string;
            updatedAt?: string | null;
            url?: string | null;
          };
          sandboxId?: string;
          state: string;
          updatedAt: number;
        }>,
        Name
      >;
    };
  };

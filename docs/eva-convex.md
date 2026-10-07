# Eva Convex conventions

Read this when touching `packages/backend` / Convex schema, queries, mutations, or migrations.

**Sandbox / Snapshot Storage lifecycle** (never-expire, 48h delete, resume fallthrough, orphan purge): [`docs/sandbox-snapshot-lifecycle.md`](./sandbox-snapshot-lifecycle.md).

**Multi-repo sessions / codebase groups** (`sessionRepos`, `repoGroups`, `/tmp/workspace` layout, cross-installation git auth, group snapshots): [`docs/multi-repo-sessions.md`](./multi-repo-sessions.md).

## Types

- Never manually define interfaces for Convex documents.
- Always import: `Doc<"tableName">`, `Id<"fieldName">`, `FunctionReturnType<typeof api.functionName>`
- Convex types are the single source of truth. Never duplicate schema types manually.
- If the schema changes, all consumers must update automatically.

## Validators / schema fields

- Single source of truth for table fields: export `const xxxFields = { ... }` in `validators.ts`.
- Use in both `schema.ts` (`defineTable(xxxFields)`) and return validators (`v.object({ _id: v.id("table"), _creationTime: v.number(), ...xxxFields })`).
- Never duplicate field definitions between schema and return validators.

## Forms / live queries

- Do not mirror Convex query data into `useState` for form inputs. Queries are live — bind `value` to the query result and call the mutation in `onChange`.
- For instant feedback (textareas, fast typing), attach `.withOptimisticUpdate` to the mutation to patch the local query cache. No local state, no hydration `useEffect`, no debounce draft copy.

## Env / runtime

- Avoid importing `process.env` helpers into Convex isolate workflow files. If something needs env vars, keep it in `"use node"` actions.
- Sandbox paths come from `_sandbox_runtime/workspaceLayout.ts` (isolate-safe: `WORKSPACE_ROOT`, `PRIMARY_REPO_DIR`, `linkedRepoDir`, `primaryLinkPath`) or `_sandbox_runtime/helpers.ts:WORKSPACE_DIR` in node modules. Never add a new `/tmp/...` string literal.

## Typecheck

- `cd packages/backend && npx convex codegen --typecheck enable` (no dev server needed)

## Migrations

- Field type change with existing data: `v.union(oldType, newType)` temporarily → deploy → run migration → change to only newType.
- When asked to run a migration that removes a field: add a migration that clears docs with that field → run it → remove fields from schema → delete the migration function.
- Prefer the `convex-migration-helper` skill for non-trivial migrations.

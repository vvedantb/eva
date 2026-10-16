import type { SystemSkillHydration } from "./registry";

/**
 * Content served by the `get_skill` MCP tool for `eva-setup`: write the repo's
 * `.eva/` folder so Eva can run it. The draft is today's Convex commands, so a
 * migrating repo keeps exactly what it runs now.
 */
export function buildEvaSetupContent({
  owner,
  name,
  baseBranch,
  evaConfigDraft,
}: SystemSkillHydration): string {
  const draft = evaConfigDraft ?? "";
  return `# eva-setup

Set up \`${owner}/${name}\` to run in Eva. Eva reads two files from the repo's default branch (\`${baseBranch}\`):

- \`.eva/config.json\`: the commands that install, start and seed each app.
- \`.eva/mcp.json\`: extra MCP servers for agents (optional).

Secrets never go in these files. Reference them as \`\${NAME}\`; Eva fills them from the repo's env vars.

## 1. Start from what Eva runs today

This draft is built from the commands Eva has stored for this repo. Keep every command that still works. If it is empty, detect the setup in step 2.

**The draft can contain inline secrets** (deploy keys, service-role keys, passwords, tokens, database URLs with credentials). Never commit one. Replace each with a shell variable (\`$NAME\`), and make sure \`NAME\` exists as a repo env var (step 5). Commands run with the repo's env vars set.

\`\`\`json
${draft.trimEnd()}
\`\`\`

## 2. Detect the stack

1. Find the package manager (lockfile), the apps (workspace globs, \`apps/*\`), and each app's dev script and port.
2. Find the services each app needs: databases (Postgres, Supabase, Convex), queues, Docker.
3. Read the README, CLAUDE.md / AGENTS.md, \`.claude/launch.json\` and \`.cursor/environment.json\` for run instructions.

## 3. Write \`.eva/config.json\`

\`\`\`jsonc
{
  "version": 1,
  "snapshot": {
    "build": [],   // run once per snapshot build after install (codegen, builds)
    "seed": []     // run once per snapshot build after services are up (load data)
  },
  "apps": [
    {
      "path": "apps/web",            // the app folder; "" for a single-app repo
      "dev": { "command": "pnpm dev", "port": 3000 },
      "startup": [],                  // run on boot, from the repo root, after background services start
      "background": [],               // long-running services (e.g. "npx convex dev"), relaunched on every boot
      "stop": [],                     // clean shutdown before a snapshot; non-empty enables a seeded snapshot
      "snapshot": { "build": [], "seed": [] }  // optional: this app's own snapshot commands, replacing the top-level block
    }
  ]
}
\`\`\`

Rules:

- Every command runs from the repo root. \`cd\` into the app folder inside the command when needed.
- Commands must be idempotent: Eva reruns startup commands when they change.
- Do not add wait loops for \`convex dev\`. Eva already waits for Convex to be ready.
- One entry per app. The \`path\` must match the app folder Eva shows for the repo.

## 4. Write \`.eva/mcp.json\` (only when the repo uses MCP servers)

Use the same shape as \`.mcp.json\`. Move servers from \`.mcp.json\` and \`.cursor/mcp.json\` into it, and replace every secret with \`\${NAME}\`. Leave out \`eva\`, \`linear\` and \`figma\`: Eva adds those itself.

\`\`\`json
{ "mcpServers": { "sentry": { "type": "http", "url": "https://mcp.sentry.dev/mcp", "headers": { "Authorization": "Bearer \${SENTRY_TOKEN}" } } } }
\`\`\`

## 5. Ask for missing secrets

Call \`list_env_vars\` on the \`eva\` MCP server. For each variable the commands or MCP servers need that is not set, call \`request_env_var\`. Never ask the user to paste a secret in chat.

## 6. Prove it works

1. Run the background commands, then the startup commands, in this sandbox.
2. Check the dev server port answers (\`curl -sf http://localhost:<port>\`). If Eva's Preview already runs a dev server, use it; never start a second one on the same port. Otherwise start the dev command once in the background.
3. Fix the file until both work. Report any command you could not make work.

## 7. Commit

Before you commit, search \`.eva/\` for anything that looks like a secret and replace it. Then commit \`.eva/\` on this branch. Eva opens the PR. After it merges to \`${baseBranch}\`, Eva uses the file for every new sandbox and the next snapshot build.
`;
}

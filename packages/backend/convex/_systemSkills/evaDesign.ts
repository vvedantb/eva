import type { SystemSkillHydration } from "./registry";

const VARIATION_STRATEGIES = [
  "a — Clean/conventional: clarity, familiar patterns, straightforward navigation",
  "b — Creative/bold: unconventional layout, striking hierarchy, unique interactions",
  "c — Compact/efficient: high density, minimal chrome, space-efficient",
  "d — Immersive/visual: full-screen imagery, rich motion, cinematic feel",
  "e — Accessible/minimal: maximum legibility, highest contrast, simplified interactions",
];

/**
 * Content served by the `get_skill` MCP tool for `eva-design`. Replaces the old
 * design-mode turn prompt. The final-message JSON is a machine contract: Eva
 * parses the first JSON value in the reply to populate the session's Designs
 * tab, so the shape below must not drift.
 */
export function buildEvaDesignContent(
  hydration: SystemSkillHydration,
): string {
  const devPort = hydration.devPort ?? 3000;
  const rootDirectoryLine = hydration.rootDirectory
    ? `\n- App directory: \`/tmp/repo/${hydration.rootDirectory}\` — the \`app/\` paths below are relative to it.`
    : "";
  const strategies = VARIATION_STRATEGIES.map(
    (strategy) => `- ${strategy}`,
  ).join("\n");

  return `# eva-design

Generate several design variations of a UI, each viewable in the running app, then report them as JSON so Eva can show them in the Designs tab.

## This repo
- Repo: ${hydration.owner}/${hydration.name}
- Preview harness: \`http://localhost:${devPort}/design-preview?v=<label>\`${rootDirectoryLine}

## Step 1 — Read the request
- **How many variations?** Default to 3. Use a different number only when the user's message asks for one (e.g. "give me two options", "5 variations"). Cap at 5 — there are only five distinct directions below.
- **Persona and style.** Apply whatever audience, brand, tone, or style the user describes in their message ("for hospital admins", "make it feel like Linear"). If they name none, design for the product's existing audience as the codebase implies it.
- **Refining an earlier design?** If the user points at one of the previous variations, read that file first and preserve its layout structure, colour choices, and interaction patterns. Change only what they asked for.

## Step 2 — Discover the design system
1. Read \`CLAUDE.md\` (or the repo's equivalent) to understand the project.
2. Find the styling config: \`tailwind.config.*\`, \`globals.css\`, \`theme.ts\`, \`stitches.config.*\`, a styled-components theme, CSS custom properties — whatever this repo uses.
3. Read existing components for the styling approach, token names, and visual patterns.
4. Note the icon library the repo already imports.

Use ONLY the project's own design tokens and theme. Never hardcode colours, raw hex values, or default framework utility colours.

## Step 3 — Build the preview harness
Each variation lives behind \`/design-preview?v=<label>\`, labelled \`a\`, \`b\`, \`c\`, … in order. Check whether \`app/design-preview/page.tsx\` exists; if not, create it as a lazy-loading router with one entry per variation:

\`\`\`tsx
'use client';
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const variations: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  a: lazy(() => import('./variations/variation-a')),
  b: lazy(() => import('./variations/variation-b')),
  c: lazy(() => import('./variations/variation-c')),
};

export default function DesignPreview() {
  const params = useSearchParams();
  const v = params.get('v') || 'a';
  const Component = variations[v] || variations.a;
  return <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><p>Loading...</p></div>}><Component /></Suspense>;
}
\`\`\`

If the harness already exists, extend its \`variations\` map rather than replacing the file. Match the repo's router: the scaffold above is Next.js App Router; adapt the import and search-param lookup if this project routes differently.

## Step 4 — Write the variations
Write one file per variation to \`app/design-preview/variations/variation-<label>.tsx\`, default-exporting \`VariationA\`, \`VariationB\`, and so on. Give each a different direction, in this order:

${strategies}

Rules for every variation:
- Import hooks from \`react\` directly — never \`React.useState\`.
- Real interactivity: state for toggles, modals, and tabs; \`onClick\` handlers; working form inputs.
- Use the repo's existing icon library on every clickable element and section header.
- Realistic content — real-looking names, dates, and numbers, never placeholder text.
- Clear hierarchy on the project's spacing scale, generous whitespace, responsive layouts.
- Hover feedback on every interactive element, smooth transitions, visible focus rings.
- Prioritise distinctive design and WCAG accessibility.

## Step 5 — Verify
Load each \`http://localhost:${devPort}/design-preview?v=<label>\` and confirm it renders. Eva auto-starts the dev server after every sandbox start and a cold compile takes 1-2 minutes, so retry before concluding it is down, and NEVER start a second dev server. Fix any variation that errors or renders blank.

Committing the variation files is fine — Eva pushes the branch after the turn.

## Step 6 — Report (machine contract)
End your FINAL message with a single JSON object and nothing after it. Eva parses the first JSON value in that message to populate the Designs tab, so the shape is fixed:

\`\`\`json
{
  "summary": "Brief note on the design decisions",
  "variations": [
    { "label": "Design A - clean", "route": "/design-preview?v=a", "filePath": "app/design-preview/variations/variation-a.tsx" },
    { "label": "Design B - bold", "route": "/design-preview?v=b", "filePath": "app/design-preview/variations/variation-b.tsx" },
    { "label": "Design C - compact", "route": "/design-preview?v=c", "filePath": "app/design-preview/variations/variation-c.tsx" }
  ]
}
\`\`\`

One entry per variation you wrote, in label order. \`label\` and \`filePath\` are required; \`route\` is the preview path. Keep any prose before the JSON short — the \`summary\` is what Eva shows.

## Rules
- Never use \`sleep\` or \`2>/dev/null\` without \`|| echo "fallback"\`.
- Do not delete or rewrite unrelated app files to make room for the harness.
`;
}

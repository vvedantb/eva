import { buildEvaCaptureContent } from "./evaCapture";
import { buildEvaAuditContent } from "./evaAudit";
import { buildEvaPlanContent } from "./evaPlan";
import { buildEvaDesignContent } from "./evaDesign";
import { buildEvaAskContent } from "./evaAsk";

/**
 * Eva-provided ("system") skills. Definitions live here rather than in a table
 * so they can be updated by deploying, and so the installed artefact in a repo
 * checkout stays a thin stub that fetches the real content over MCP.
 */
export const SYSTEM_SKILL_NAMES = [
  "eva-capture",
  "eva-audit",
  "eva-plan",
  "eva-design",
  "eva-ask",
] as const;

export type SystemSkillName = (typeof SYSTEM_SKILL_NAMES)[number];

/** Per-repo values baked into the content served by the `get_skill` MCP tool. */
export type SystemSkillHydration = {
  owner: string;
  name: string;
  rootDirectory?: string;
  devPort?: number;
  devCommand?: string;
  startupCommands?: string[];
  baseBranch: string;
};

export type SystemSkillDefinition = {
  name: SystemSkillName;
  /** Frontmatter description — drives harness auto-trigger. Keep single-line. */
  description: string;
  buildContent: (hydration: SystemSkillHydration) => string;
};

/**
 * Marks a SKILL.md as Eva-materialized. Stubs carrying it are overwritten and
 * pruned freely; a same-named file without it is user-owned and never touched.
 * Duplicated in `callback-src/runtime/systemSkills.ts` (no shared import path).
 */
export const SYSTEM_SKILL_MARKER = "<!-- eva:system-skill -->";

export const SYSTEM_SKILLS: Record<SystemSkillName, SystemSkillDefinition> = {
  "eva-capture": {
    name: "eva-capture",
    description:
      "Capture visual proof of UI changes with the shared browser and leave recordings or screenshots for Eva to attach to the chat. Use when the user asks for a recording, walkthrough, screenshot, or proof that a change works.",
    buildContent: buildEvaCaptureContent,
  },
  "eva-audit": {
    name: "eva-audit",
    description:
      "Audit this branch against Eva's standard review categories and report the findings in chat. Use when the user asks for a code audit, a review of this branch, or a quality check before shipping.",
    buildContent: buildEvaAuditContent,
  },
  "eva-plan": {
    name: "eva-plan",
    description:
      "Write or revise an implementation plan (PRD) for this session in plan.md, exploring the codebase first and implementing nothing. Use when the user asks to plan, scope, or spec work before it is built, or to revise the existing plan.",
    buildContent: buildEvaPlanContent,
  },
  "eva-design": {
    name: "eva-design",
    description:
      "Generate N design variations of a UI behind the app's /design-preview harness and report them so Eva can show them side by side. Use when the user asks for design options, variations, mockups, or a few directions for a screen.",
    buildContent: buildEvaDesignContent,
  },
  "eva-ask": {
    name: "eva-ask",
    description:
      "Explain something in this repo in a simple tutor voice. Use only when the user explicitly invokes /eva-ask or names this skill — never auto-trigger on ordinary questions.",
    buildContent: buildEvaAskContent,
  },
};

export function isSystemSkillName(name: string): name is SystemSkillName {
  return name in SYSTEM_SKILLS;
}

export function listSystemSkills(): SystemSkillDefinition[] {
  return SYSTEM_SKILL_NAMES.map((name) => SYSTEM_SKILLS[name]);
}

/**
 * The file written into `.agents/skills/<name>/SKILL.md`. Deliberately carries
 * no instructions of its own — the agent fetches those over MCP on invoke.
 */
export function buildStubMarkdown(definition: SystemSkillDefinition): string {
  return `---
name: ${definition.name}
description: ${definition.description}
---

${SYSTEM_SKILL_MARKER}

# ${definition.name}

This is an Eva system skill. Its instructions live on the Eva server so they stay current — they are not in this file.

1. Call the \`get_skill\` tool on the \`eva\` MCP server with \`{"name": "${definition.name}"}\`.
2. Follow the instructions it returns for the rest of this request.
3. If the tool is missing or returns an error, stop and tell the user that the Eva MCP server is unavailable, so \`${definition.name}\` cannot run. Do not improvise a replacement.
`;
}

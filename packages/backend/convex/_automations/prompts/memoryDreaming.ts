import { AGENT_MEMORY_DIR, AGENT_MEMORY_FORMAT } from "../../prompts";

/** Prompt for the `memory-dreaming` catalog entry. */
export const MEMORY_DREAMING_PROMPT = `## Goal

Consolidate this repo's agent memory in \`${AGENT_MEMORY_DIR}/\` so future sessions get a short, correct, deduplicated set of notes. If the folder does not exist, stop and report that agent memory is not in use.

## Entry format

${AGENT_MEMORY_FORMAT}

## What to do

- Merge duplicate or overlapping entries into one, keeping the earliest \`added\` date and every source.
- Check entries against the current code and git history. Fix entries the code contradicts; remove entries about code that no longer exists.
- Where two entries contradict each other, check the sources and keep the one that matches the code.
- Spot patterns repeated across entries and promote them to a single clearer entry.
- Move detail out of \`MEMORY.md\` into topic files when it grows past ~100 lines, and fix every \`[[path]]\` link.
- Remove anything that looks like a secret, credential, customer or client data, or information that identifies a person.

## Guardrails

- Edit only files inside \`${AGENT_MEMORY_DIR}/\`.
- Do not invent facts. Every kept entry must trace to a source or to the code.
- If nothing needs to change, make no commit.

## Output

If you open a PR, summarize:
- Entries merged, corrected, and removed (with counts)
- Any entry removed for containing sensitive data (describe the kind, never the content)`;

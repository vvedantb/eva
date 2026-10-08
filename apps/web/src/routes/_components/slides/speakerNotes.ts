import { SLIDES } from "./slides/index";

interface SpeakerNotes {
  slideTitle: string;
  notes: string;
}

const NOTES: Record<string, string> = {
  "00": "",
  "01": `Welcome — this is Eva.

Eva is a platform for AI agents that actually ship code.
Not a chatbot that suggests diffs. Not an autocomplete.
Agents that clone your repo, run your tests, and open real PRs.`,

  "02": `The gap between AI demos and real work is:
- Context: the agent needs your codebase, your style, your CI.
- Execution: it needs a place to run commands, not just generate text.
- Review: you need to see what it did, not just trust a summary.`,

  "03": `Quick tasks are the simplest unit.
"Fix this bug", "Add a test", "Update this copy".
Eva spins up an isolated sandbox, does the work, and shows you the result.
No boilerplate. No PR dance. Just a diff you can merge.`,

  "04": `Sessions are longer-lived dev environments.
You describe what you're building, Eva sets up a sandbox with your app running.
You iterate together — you can see the preview, the logs, the terminal.
It's like pairing with someone who never gets tired.`,

  "05": `Projects are for larger features that span multiple sessions or tasks.
A product spec, broken into phases, tracked over time.
Eva reads your docs, plans the work, and executes it piece by piece.`,

  "06": `Documents are first-class. Specs, notes, context.
Eva reads them while working, so the agent knows what you're building.
No copy-pasting into prompts. Just write it once.`,

  "07": `When Eva finishes a task, it opens a PR.
You review it like any other PR — code, tests, CI status.
No magic. No hidden prompts. Just code you can read.`,

  "08": `The stack:
- React + Vite for the frontend
- Convex for the backend (real-time, type-safe)
- Vercel sandboxes for isolated execution
- Clerk for auth
- GitHub App for repo access

It's MIT open source.`,

  "09": `Eva connects to your GitHub repos.
It clones the code, respects your .gitignore, and pushes to branches.
You control what it can access.`,

  "10": `Sandboxes are ephemeral VMs.
Each task or session gets its own isolated environment.
Your code runs, your tests run, your app runs — then it's gone.`,

  "11": `The key insight: agents need execution, not just generation.
They need to run npm install. Run your build. See if the tests pass.
That's what makes the difference between "here's a diff" and "here's working code".`,

  "12": `The demo: you'll see Eva take a quick task, spin up a sandbox,
make the change, run the tests, and open a PR.
All from a one-line description.`,

  "13": `Thank you.

Eva is live at eva.vedantb.com
GitHub: github.com/vvedantb/eva
MIT open source — run it yourself.`,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getSpeakerNotes(slideNumber: number): SpeakerNotes {
  const index = clamp(slideNumber - 1, 0, SLIDES.length - 1);
  const entry = SLIDES[index];
  return {
    slideTitle: entry.title,
    notes: NOTES[entry.id] ?? "",
  };
}

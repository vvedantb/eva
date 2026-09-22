"use client";

import { cn } from "../utils/cn";
import {
  IconFileSearch,
  IconPencil,
  IconFilePlus,
  IconTerminal2,
  IconFolderSearch,
  IconFileText,
  IconWorld,
  IconSearch,
  IconSitemap,
  IconBook2,
  IconTool,
  IconMessage,
  IconListCheck,
  IconInfoCircle,
  IconAnchor,
  IconLoader2,
} from "@tabler/icons-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import {
  quantizedSnapshot,
  subscribeQuantized,
} from "../utils/sharedClock";

/** One item in a todo checklist step (type "todos"). */
export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface ActivityStepOutput {
  text: string;
  exitCode?: number;
  truncated?: boolean;
}

export interface ActivityStepEdit {
  oldText: string;
  newText: string;
}

/** One choice offered by an AskUserQuestion prompt. */
export interface ActivityQuestionOption {
  label: string;
  description?: string;
}

/** One question of an AskUserQuestion prompt, with the choices shown. */
export interface ActivityQuestion {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: ActivityQuestionOption[];
}

export interface ActivityStep {
  type:
    | "read"
    | "edit"
    | "write"
    | "bash"
    | "search_files"
    | "search_code"
    | "web_fetch"
    | "web_search"
    | "subtask"
    | "notebook"
    | "thinking"
    | "reasoning"
    | "response"
    | "question"
    | "todos"
    | "tool"
    | "notice"
    | "hook"
    | "status";
  label: string;
  detail?: string;
  /** Full, unshortened path for file-type steps. Powers the chat File Viewer. */
  path?: string;
  status: "complete" | "active";
  /** The tool_use id that produced this step (Claude only). */
  toolUseId?: string;
  /** Parent `Agent` tool_use id — set on steps that ran inside a subagent. */
  parentToolUseId?: string;
  /** Todo checklist snapshot (type "todos" only). */
  todos?: TodoItem[];
  /** Bash command (fuller than detail, capped). */
  command?: string;
  /** Tool result transcript (tail-capped). */
  output?: ActivityStepOutput;
  /** Edit before/after snippets. */
  edits?: ActivityStepEdit[];
  /** Codex file_change paths. */
  files?: string[];
  /** Write tool content head preview. */
  contentPreview?: string;
  /** True when the tool failed or exited non-zero. */
  isError?: boolean;
  /** Wall time from push → complete (ms). */
  durationMs?: number;
  /** AskUserQuestion prompt (type "question" only): the questions and options shown to the user. */
  questions?: ActivityQuestion[];
  /** AskUserQuestion answers keyed by question text. Absent when the turn ended without a structured answer. */
  answers?: Record<string, string>;
}

/** True when the step has expandable rich detail to show. */
export function stepHasRichDetail(step: ActivityStep): boolean {
  return Boolean(
    step.command ||
    step.output ||
    (step.edits && step.edits.length > 0) ||
    (step.files && step.files.length > 0) ||
    step.contentPreview,
  );
}

export function EvaThinkingIcon({ className }: { className?: string }) {
  return (
    <img
      src="/icon.svg"
      alt="Eva"
      width={16}
      height={16}
      className={cn("rounded-full", className)}
    />
  );
}

export const stepConfig = {
  read: { icon: IconFileSearch, defaultLabel: "Read file" },
  edit: { icon: IconPencil, defaultLabel: "Edited file" },
  write: { icon: IconFilePlus, defaultLabel: "Created file" },
  bash: { icon: IconTerminal2, defaultLabel: "Ran command" },
  search_files: { icon: IconFolderSearch, defaultLabel: "Found files" },
  search_code: { icon: IconFileText, defaultLabel: "Searched code" },
  web_fetch: { icon: IconWorld, defaultLabel: "Fetched URL" },
  web_search: { icon: IconSearch, defaultLabel: "Web search" },
  subtask: { icon: IconSitemap, defaultLabel: "Ran agent" },
  notebook: { icon: IconBook2, defaultLabel: "Edited notebook" },
  thinking: { icon: EvaThinkingIcon, defaultLabel: "Thinking..." },
  reasoning: { icon: EvaThinkingIcon, defaultLabel: "Thinking..." },
  response: { icon: IconMessage, defaultLabel: "Response" },
  question: { icon: IconMessage, defaultLabel: "Asked a question" },
  todos: { icon: IconListCheck, defaultLabel: "Task list" },
  tool: { icon: IconTool, defaultLabel: "Used tool" },
  notice: { icon: IconInfoCircle, defaultLabel: "Notice" },
  hook: { icon: IconAnchor, defaultLabel: "Hook" },
  status: { icon: IconLoader2, defaultLabel: "Status" },
};

const SPINNER_VERBS = [
  "Accomplishing",
  "Actioning",
  "Actualizing",
  "Architecting",
  "Baking",
  "Beaming",
  "Beboppin'",
  "Befuddling",
  "Billowing",
  "Blanching",
  "Bloviating",
  "Boogieing",
  "Boondoggling",
  "Booping",
  "Bootstrapping",
  "Brewing",
  "Bunning",
  "Burrowing",
  "Calculating",
  "Canoodling",
  "Caramelizing",
  "Cascading",
  "Catapulting",
  "Cerebrating",
  "Channeling",
  "Channelling",
  "Choreographing",
  "Churning",
  "Clauding",
  "Coalescing",
  "Cogitating",
  "Combobulating",
  "Composing",
  "Computing",
  "Concocting",
  "Considering",
  "Contemplating",
  "Cooking",
  "Crafting",
  "Creating",
  "Crunching",
  "Crystallizing",
  "Cultivating",
  "Deciphering",
  "Deliberating",
  "Determining",
  "Dilly-dallying",
  "Discombobulating",
  "Doing",
  "Doodling",
  "Drizzling",
  "Ebbing",
  "Effecting",
  "Elucidating",
  "Embellishing",
  "Enchanting",
  "Envisioning",
  "Evaporating",
  "Fermenting",
  "Fiddle-faddling",
  "Finagling",
  "Flambéing",
  "Flibbertigibbeting",
  "Flowing",
  "Flummoxing",
  "Fluttering",
  "Forging",
  "Forming",
  "Frolicking",
  "Frosting",
  "Gallivanting",
  "Galloping",
  "Garnishing",
  "Generating",
  "Gesticulating",
  "Germinating",
  "Gitifying",
  "Grooving",
  "Gusting",
  "Harmonizing",
  "Hashing",
  "Hatching",
  "Herding",
  "Honking",
  "Hullaballooing",
  "Hyperspacing",
  "Ideating",
  "Imagining",
  "Improvising",
  "Incubating",
  "Inferring",
  "Infusing",
  "Ionizing",
  "Jitterbugging",
  "Julienning",
  "Kneading",
  "Leavening",
  "Levitating",
  "Lollygagging",
  "Manifesting",
  "Marinating",
  "Meandering",
  "Metamorphosing",
  "Misting",
  "Moonwalking",
  "Moseying",
  "Mulling",
  "Mustering",
  "Musing",
  "Nebulizing",
  "Nesting",
  "Newspapering",
  "Noodling",
  "Nucleating",
  "Orbiting",
  "Orchestrating",
  "Osmosing",
  "Perambulating",
  "Percolating",
  "Perusing",
  "Philosophising",
  "Photosynthesizing",
  "Pollinating",
  "Pondering",
  "Pontificating",
  "Pouncing",
  "Precipitating",
  "Prestidigitating",
  "Processing",
  "Proofing",
  "Propagating",
  "Puttering",
  "Puzzling",
  "Quantumizing",
  "Razzle-dazzling",
  "Razzmatazzing",
  "Recombobulating",
  "Reticulating",
  "Roosting",
  "Ruminating",
  "Sautéing",
  "Scampering",
  "Schlepping",
  "Scurrying",
  "Seasoning",
  "Shenaniganing",
  "Shimmying",
  "Simmering",
  "Skedaddling",
  "Sketching",
  "Slithering",
  "Smooshing",
  "Sock-hopping",
  "Spelunking",
  "Spinning",
  "Sprouting",
  "Stewing",
  "Sublimating",
  "Swirling",
  "Swooping",
  "Symbioting",
  "Synthesizing",
  "Tempering",
  "Thinking",
  "Thundering",
  "Tinkering",
  "Tomfoolering",
  "Topsy-turvying",
  "Transfiguring",
  "Transmuting",
  "Twisting",
  "Undulating",
  "Unfurling",
  "Unravelling",
  "Vibing",
  "Waddling",
  "Wandering",
  "Warping",
  "Whatchamacalliting",
  "Whirlpooling",
  "Whirring",
  "Whisking",
  "Wibbling",
  "Working",
  "Wrangling",
  "Zesting",
  "Zigzagging",
] as const;

export function getRandomVerb(): string {
  return SPINNER_VERBS[Math.floor(Math.random() * SPINNER_VERBS.length)];
}

export function useSpinnerVerb(active: boolean): string {
  const [verb, setVerb] = useState(getRandomVerb);
  useEffect(() => {
    if (!active) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (id !== undefined) return;
      id = setInterval(() => {
        setVerb(getRandomVerb());
      }, 3000);
    };
    const stop = () => {
      if (id === undefined) return;
      clearInterval(id);
      id = undefined;
    };
    const onVisibility = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        stop();
        return;
      }
      start();
    };
    onVisibility();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [active]);
  return verb;
}

const SECOND_MS = 1000;
const noopSubscribe = () => () => {};

export function useElapsedSeconds(
  startedAt: number | undefined,
  active: boolean,
) {
  const tick = useSyncExternalStore(
    active && startedAt
      ? (onChange) => subscribeQuantized(SECOND_MS, onChange)
      : noopSubscribe,
    () => quantizedSnapshot(SECOND_MS),
    () => quantizedSnapshot(SECOND_MS),
  );
  if (!active || !startedAt) return 0;
  return Math.max(0, Math.floor((tick - startedAt) / 1000));
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

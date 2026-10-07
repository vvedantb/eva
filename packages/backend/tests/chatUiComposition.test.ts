import { describe, expect, it } from "vitest";
import {
  experimental_composeSpec,
  type Experimental_CompositionEvaluator,
  type Spec,
} from "@json-render/core";
import { chatUiCatalog, parseChatUiSpec } from "@eva/shared/generativeUi";
import { buildChatUiCandidates } from "../convex/_generativeUi/candidates";
import { appendMissingBlocks } from "../convex/_generativeUi/completeness";
import { renderUiInput, type ChatUiBlock } from "../convex/_generativeUi/schema";

/**
 * Composition itself is Jev's job, but the grammar around it is ours: the
 * candidates we hand the composer must be placeable, every block the agent
 * supplied has to reach the panel, and whatever comes back must survive the
 * catalog and the client's boundary parse. Stand-in evaluators prove all three
 * without a network call.
 */

/** Takes the first option every time — which for a membership question is `omit`. */
const omitEverything: Experimental_CompositionEvaluator = async ({
  questions,
}) => ({
  answers: Object.fromEntries(
    Object.entries(questions).map(([id, question]) => {
      const choice = Object.keys(question.criteria)[0];
      if (choice === undefined) throw new Error(`No criteria for ${id}`);
      return [id, { choice, confidence: 1 }];
    }),
  ),
});

/** Includes every offered element, i.e. the opposite extreme. */
const includeEverything: Experimental_CompositionEvaluator = async ({
  questions,
}) => ({
  answers: Object.fromEntries(
    Object.entries(questions).map(([id, question]) => {
      const keys = Object.keys(question.criteria);
      const use = keys.find((key) => key.startsWith("use:"));
      const choice = use ?? keys[0];
      if (choice === undefined) throw new Error(`No criteria for ${id}`);
      return [id, { choice, confidence: 1 }];
    }),
  ),
});

const BLOCKS: ChatUiBlock[] = [
  { kind: "metric", label: "Passed", value: "128", tone: "positive" },
  { kind: "metric", label: "Failed", value: "2", tone: "danger" },
  {
    kind: "text",
    text: "Both failures are in the billing suite.",
    emphasis: "body",
  },
  {
    kind: "button",
    label: "Fix them",
    reply: "fix the billing timeouts",
    variant: "primary",
  },
];

async function compose(
  evaluate: Experimental_CompositionEvaluator,
): Promise<Spec> {
  const candidates = buildChatUiCandidates(BLOCKS, "Test run");
  let composed: Spec | null = null;
  for await (const event of experimental_composeSpec({
    catalog: chatUiCatalog,
    candidates,
    prompt: "a row of metrics, a short summary and a button",
    evaluate,
    maxElements: 14,
    maxSteps: 14,
    maxDepth: 4,
  })) {
    if (event.type === "complete") composed = event.spec;
  }
  if (composed === null) throw new Error("Composition produced no spec");
  return appendMissingBlocks(composed, candidates).spec;
}

/** Every element that is not one of our layout containers. */
function contentTypes(spec: Spec): string[] {
  const layout = new Set(["Stack", "Grid", "Panel", "Separator"]);
  return Object.values(spec.elements)
    .map((element) => element.type)
    .filter((type) => !layout.has(type));
}

describe("chat UI composition", () => {
  it("shows every block even when the evaluator omits them all", async () => {
    const spec = await compose(omitEverything);
    expect(contentTypes(spec).sort()).toEqual([
      "Button",
      "Metric",
      "Metric",
      "Text",
    ]);
    expect(chatUiCatalog.validate(spec).success).toBe(true);
    expect(parseChatUiSpec(JSON.stringify(spec))).not.toBeNull();
  });

  it("shows every block exactly once when the evaluator takes them all", async () => {
    const spec = await compose(includeEverything);
    expect(contentTypes(spec).sort()).toEqual([
      "Button",
      "Metric",
      "Metric",
      "Text",
    ]);
    expect(chatUiCatalog.validate(spec).success).toBe(true);
  });

  it("carries a button's reply through as an action binding", () => {
    const candidates = buildChatUiCandidates(BLOCKS, undefined);
    const button = candidates.find((candidate) => candidate.id === "block_3");
    expect(button?.element.on).toEqual({
      press: {
        action: "reply",
        params: { message: "fix the billing timeouts" },
      },
    });
  });

  it("gives every content block exactly one placement", () => {
    const blockCandidates = buildChatUiCandidates(BLOCKS, undefined).filter(
      (candidate) => candidate.id.startsWith("block_"),
    );
    expect(blockCandidates).toHaveLength(BLOCKS.length);
    for (const candidate of blockCandidates) {
      expect(candidate.maxUses).toBe(1);
      expect(candidate.root).toBe(false);
    }
  });

  it("rejects a call with no blocks", () => {
    expect(
      renderUiInput.safeParse({ prompt: "a panel", blocks: [] }).success,
    ).toBe(false);
  });

  it("rejects a button link that is not http(s)", () => {
    const attempt = (url: string) =>
      renderUiInput.safeParse({
        prompt: "a panel",
        blocks: [{ kind: "button", label: "Go", url }],
      }).success;
    expect(attempt("https://example.com/report")).toBe(true);
    expect(attempt("javascript:alert(1)")).toBe(false);
    expect(attempt("data:text/html,<script>alert(1)</script>")).toBe(false);
  });
});

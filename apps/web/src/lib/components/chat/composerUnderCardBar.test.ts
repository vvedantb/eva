import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

/** Comments there name the very shapes these assertions rule out. */
function sourceOf(relativePath: string): string {
  return readFileSync(join(here, relativePath), "utf8")
    .replaceAll("\r\n", "\n")
    .replace(/\/\*\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const composer = sourceOf("ChatComposer.tsx");
const stash = sourceOf("_components/ComposerStash.tsx");
const inputChrome = sourceOf("_components/ComposerInputChrome.tsx");

/**
 * The muted under-card bar is the only home the model picker has (fix
 * 6ac4981e6) and, since fix c5050d3b4, the stash trigger's home too. Both fixes
 * were the same mistake: the bar rendered behind a condition, so composer
 * surfaces that did not meet it — the ones with no base-branch control, and the
 * draft-loading state — came up with no way to change model at all.
 *
 * Nothing here fails to compile and the gap only shows on the surfaces that
 * miss the condition, so a reviewer reading `underCardLeading ? (...)` sees
 * plausible code. These are source-level assertions because the property is
 * structural: the bar is rendered on every branch, and the picker is rendered
 * once, in the bar.
 */
describe("the composer's under-card bar", () => {
  test("is not gated on the optional leading control", () => {
    // Only the leading slot inside the bar may test underCardLeading; a ternary
    // wrapping the bar itself is the regression both fixes undid.
    const gates = composer.match(/underCardLeading \?/g) ?? [];
    expect(gates).toHaveLength(1);
    expect(composer).toContain("{underCardLeading}</div>");
  });

  test("renders on the draft-loading branch as well as the loaded one", () => {
    // Loading a draft is the slowest moment on a cold session — the surface a
    // dropped bar is most visible on.
    expect(composer).toContain("{mutedBar(null)}");
    expect(composer).toContain("bar={mutedBar}");
  });

  test("holds the only model picker in the composer tree", () => {
    expect(composer).toContain("<ModelSelectWithTraits");
    expect(composer.match(/<ModelSelectWithTraits/g)).toHaveLength(1);
    // It used to live in the input chrome; two mounted pickers disagree about
    // the selected model depending on which one the user reaches for.
    expect(inputChrome).not.toContain("ModelSelectWithTraits");
  });

  test("is rendered unconditionally by the stash wrapper", () => {
    // The stash owns the bar's placement so the trigger can sit inside it, and
    // passes null when there is nothing stashed rather than dropping the bar.
    expect(stash).toContain("{bar(stashButton)}");
    expect(stash).toMatch(/const stashButton =\s*\n?\s*entries\.length > 0 \?/);
  });
});

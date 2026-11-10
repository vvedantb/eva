import { EvaUiProvider } from "@eva/ui";
import { ConfirmDialog } from "@vvedantb/ui";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

/**
 * The swap to the library `ConfirmDialog` (`size="md"`) shipped its own md
 * spacing: `py-6` round the question, `pb-4` under the header, `pt-4` over the
 * footer, and the question at `text-sm`. Eva's dialogs grew big gaps until
 * `UiConfig.ConfirmDialog` in `packages/ui/src/config/overlays.ts` won them
 * back. Those classes only hold if the config is still there and the library
 * still merges it after its size classes, so render the parts and read the
 * classes that reach the DOM.
 *
 * `ConfirmDialog.Content` renders through a portal, which does not render on
 * the server, so its width is not checked here.
 */
function renderMdParts(): string {
  return renderToStaticMarkup(
    <EvaUiProvider>
      <ConfirmDialog.Root size="md" open onOpenChange={() => {}}>
        <ConfirmDialog.Header data-part="header">
          <ConfirmDialog.Title>Delete task</ConfirmDialog.Title>
        </ConfirmDialog.Header>
        <ConfirmDialog.Description data-part="description">
          Are you sure?
        </ConfirmDialog.Description>
        <ConfirmDialog.Body data-part="body">Cannot be undone.</ConfirmDialog.Body>
        <ConfirmDialog.Footer data-part="footer" />
      </ConfirmDialog.Root>
    </EvaUiProvider>,
  );
}

function partClasses(html: string, part: string): string[] {
  const tag = new RegExp(`<[^>]*data-part="${part}"[^>]*>`).exec(html)?.[0];
  expect(tag, `no ${part} rendered`).toBeDefined();
  const classes = /class="([^"]*)"/.exec(tag ?? "")?.[1] ?? "";
  return classes.split(/\s+/).filter(Boolean);
}

describe("eva's md confirm dialog look", () => {
  const html = renderMdParts();

  it("keeps the question right under the title, at text-base", () => {
    const classes = partClasses(html, "description");
    expect(classes).toContain("py-0");
    expect(classes).toContain("text-base");
    expect(classes).not.toContain("py-6");
    expect(classes).not.toContain("text-sm");
  });

  it("drops the library's md header and footer padding", () => {
    const header = partClasses(html, "header");
    expect(header).toContain("pb-0");
    expect(header).not.toContain("pb-4");

    const footer = partClasses(html, "footer");
    expect(footer).toContain("pt-0");
    expect(footer).not.toContain("pt-4");
  });

  it("pulls the detail line up under the question", () => {
    expect(partClasses(html, "body")).toContain("-mt-1");
  });
});

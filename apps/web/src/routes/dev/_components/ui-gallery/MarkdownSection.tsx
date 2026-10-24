import { Markdown, MarkdownLink } from "@eva/ui/markdown";
import { GalleryGroup, GalleryItem } from "./GalleryItem";

/**
 * Mermaid only renders once its fence is within 400px of the viewport
 * (IntersectionObserver in MarkdownMermaid), so it goes first, above the fold.
 * Until then it shows as a plain code block.
 */
const MERMAID = `\`\`\`mermaid
graph LR
  A[Before] --> B{Diff}
  B -->|0 px| C[Ship]
  B -->|changed| D[Fix]
\`\`\`
`;

/**
 * Links stay network-free: a relative path, and github.com, which renders a
 * built-in icon. Any other external host would fetch `/favicon.ico`.
 */
const SAMPLE = `# Heading one

Intro paragraph with **bold**, _italic_, ~~strike~~, \`inline code\`, a [relative link](/settings) and a [GitHub link](https://github.com/vercel/next.js).

## Heading two

### Heading three

- Unordered item
- Another item
  - Nested item

1. First step
2. Second step
3. Third step

- [x] Done task
- [ ] Open task

| Family | Status | Owner |
| --- | :---: | ---: |
| Button | Migrated | Ada |
| Dialog | In progress | Linus |
| Tabs | Planned | Grace |

\`\`\`ts
export function add(a: number, b: number): number {
  return a + b;
}
\`\`\`

\`\`\`bash
pnpm --filter @eva/web typecheck
echo "done"
\`\`\`

> A plain blockquote that spans
> two lines.

> [!NOTE]
> GitHub-style note callout.

> [!WARNING]
> GitHub-style warning callout.

Inline math $$E = mc^2$$ and a block:

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$
`;

export function MarkdownSection() {
  return (
    <>
      <GalleryGroup title="Markdown">
        <GalleryItem label="Markdown mermaid fence (renders async)" className="w-[760px]">
          <Markdown mode="static">{MERMAID}</Markdown>
        </GalleryItem>
        <GalleryItem label='Markdown mode="static" (headings, lists, table, code, quote, alerts, links, KaTeX)' className="w-[760px]">
          <Markdown mode="static">{SAMPLE}</Markdown>
        </GalleryItem>
        <GalleryItem label='Markdown className="text-sm" (short)' className="w-[420px]">
          <Markdown mode="static" className="text-sm">
            {"Short **reply** with `code` and a list:\n\n- one\n- two"}
          </Markdown>
        </GalleryItem>
      </GalleryGroup>
      <GalleryGroup title="MarkdownLink (standalone)">
        <GalleryItem label="relative href">
          <MarkdownLink href="/settings">Settings</MarkdownLink>
        </GalleryItem>
        <GalleryItem label="github.com href (icon, no network)">
          <MarkdownLink href="https://github.com/vercel/next.js">vercel/next.js</MarkdownLink>
        </GalleryItem>
        <GalleryItem label="no href (plain span)">
          <MarkdownLink>Unresolved link</MarkdownLink>
        </GalleryItem>
      </GalleryGroup>
    </>
  );
}

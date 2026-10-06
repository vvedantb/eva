import type { ClipboardEvent } from "react";

/**
 * Copying rendered markdown puts markdown on the clipboard, not the flattened
 * text the browser produces (lists lose their bullets, code loses its fence,
 * links lose their URL). The selection's DOM is walked back into markdown;
 * `text/html` still carries the rich fragment for editors that want it.
 *
 * Elements can speak for themselves with `data-markdown-copy`: `"skip"` drops
 * them (code block headers), any other value replaces their content (alert
 * titles emit their `[!NOTE]` marker).
 */

const SKIPPED_TAGS = new Set(["BUTTON", "SVG", "STYLE", "SCRIPT", "TEMPLATE", "WBR"]);

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE;
}

function skipped(element: HTMLElement): boolean {
  return (
    SKIPPED_TAGS.has(element.tagName.toUpperCase()) ||
    element.dataset.markdownCopy === "skip" ||
    element.getAttribute("aria-hidden") === "true" ||
    element.classList.contains("sr-only")
  );
}

/** A fence longer than any backtick run inside the code. */
function fence(code: string): string {
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

function children(node: Node): string {
  return Array.from(node.childNodes, serialize).join("");
}

function prefixLines(text: string, first: string, rest: string): string {
  return text
    .split("\n")
    .map((line, index) => (line === "" && index > 0 ? rest.trimEnd() : (index === 0 ? first : rest) + line))
    .join("\n");
}

function list(element: HTMLElement): string {
  const ordered = element.tagName === "OL";
  let number = Number(element.getAttribute("start") ?? "1") || 1;
  const items: string[] = [];
  for (const child of Array.from(element.children)) {
    if (!isElement(child) || child.tagName !== "LI") continue;
    const marker = ordered ? `${number++}. ` : "- ";
    const checkbox = child.querySelector(":scope > input[type=checkbox], :scope > p > input[type=checkbox]");
    const task = checkbox instanceof HTMLInputElement ? (checkbox.checked ? "[x] " : "[ ] ") : "";
    const body = children(child).trim();
    items.push(prefixLines(task + body, marker, " ".repeat(marker.length)));
  }
  return `${items.join("\n")}\n\n`;
}

function table(element: HTMLElement): string {
  const rows = Array.from(element.querySelectorAll("tr"), (row) =>
    Array.from(row.children, (cell) => children(cell).trim().replace(/\|/g, "\\|")),
  );
  const [head, ...body] = rows;
  if (!head) return "";
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return `${[line(head), line(head.map(() => "---")), ...body.map(line)].join("\n")}\n\n`;
}

function codeBlock(element: HTMLElement): string {
  const code = (element.querySelector("pre")?.textContent ?? element.textContent ?? "").replace(/\n$/, "");
  const language = element.closest("[data-language]")?.getAttribute("data-language") ?? "";
  const marker = fence(code);
  return `${marker}${language}\n${code}\n${marker}\n\n`;
}

function math(element: HTMLElement, display: boolean): string {
  const tex = element.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? element.textContent ?? "";
  return display ? `$$\n${tex}\n$$\n\n` : `$${tex}$`;
}

function serialize(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!isElement(node) || skipped(node)) return "";

  const override = node.dataset.markdownCopy;
  if (override !== undefined) return override;

  if (node.classList.contains("katex-display")) return math(node, true);
  if (node.classList.contains("katex")) return math(node, false);
  if (node.classList.contains("markdown-code") || node.tagName === "PRE") return codeBlock(node);

  const content = () => children(node);
  switch (node.tagName) {
    case "BR":
      return "\n";
    case "STRONG":
    case "B":
      return `**${content()}**`;
    case "EM":
    case "I":
      return `*${content()}*`;
    case "DEL":
    case "S":
      return `~~${content()}~~`;
    case "CODE": {
      const text = node.textContent ?? "";
      return text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``;
    }
    case "A": {
      const href = node.getAttribute("href");
      const label = content();
      if (!href || href.startsWith("streamdown:")) return label;
      return label === href ? href : `[${label}](${href})`;
    }
    case "IMG": {
      const src = node.getAttribute("src");
      return src ? `![${node.getAttribute("alt") ?? ""}](${src})` : "";
    }
    case "INPUT":
      return "";
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6":
      return `${"#".repeat(Number(node.tagName[1]))} ${content().trim()}\n\n`;
    case "P":
      return `${content().trim()}\n\n`;
    case "HR":
      return "---\n\n";
    case "UL":
    case "OL":
      return list(node);
    case "TABLE":
      return table(node);
    case "BLOCKQUOTE":
      return `${prefixLines(children(node).trim(), "> ", "> ")}\n\n`;
    default:
      if (node.getAttribute("role") === "note" && node.dataset.alert) {
        return `${prefixLines(children(node).trim().replace(/^(\[![A-Z]+\])\s*/, "$1\n"), "> ", "> ")}\n\n`;
      }
      return content();
  }
}

/** Markdown for a DOM fragment, with blank-line runs collapsed. */
export function fragmentToMarkdown(fragment: DocumentFragment | HTMLElement): string {
  return children(fragment)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * `onCopy` for a rendered markdown root. A selection inside one code block is
 * left to the browser, which already copies it verbatim.
 */
export function copyMarkdownSelection(event: ClipboardEvent<HTMLElement>): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer;
  const container = isElement(ancestor) ? ancestor : ancestor.parentElement;
  if (container?.closest("pre")) return;

  const fragment = range.cloneContents();
  const markdown = fragmentToMarkdown(fragment);
  if (markdown === "") return;

  const html = document.createElement("div");
  html.append(fragment);
  event.clipboardData.setData("text/plain", markdown);
  event.clipboardData.setData("text/html", html.innerHTML);
  event.preventDefault();
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

const TOC_HEADING_SELECTOR = "h1, h2, h3";

export function getHeadingElements(
  container: HTMLElement,
  selector = TOC_HEADING_SELECTOR,
): HTMLHeadingElement[] {
  return Array.from(container.querySelectorAll<HTMLHeadingElement>(selector));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function buildTocItems(
  headings: ReadonlyArray<{ text: string; level: number }>,
): TocItem[] {
  const seen = new Map<string, number>();
  return headings.map(({ text, level }) => {
    const base = slugify(text) || "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count}`;
    return { id, text, level };
  });
}

/** Scan rendered headings, assign stable ids, and return the TOC list. */
export function assignHeadingIds(
  container: HTMLElement,
  selector = TOC_HEADING_SELECTOR,
): TocItem[] {
  const headings = getHeadingElements(container, selector);
  const items = buildTocItems(
    headings.map((el) => ({
      text: el.textContent?.trim() ?? "",
      level: Number(el.tagName.slice(1)),
    })),
  );
  for (let i = 0; i < items.length; i++) {
    const heading = headings[i];
    if (heading) {
      heading.id = items[i].id;
      heading.style.scrollMarginTop = `${SCROLL_MARGIN_TOP_PX}px`;
    }
  }
  return items;
}

/** Matches FloatingToc scroll offset so click-scroll lands below sticky chrome. */
const SCROLL_MARGIN_TOP_PX = 96;

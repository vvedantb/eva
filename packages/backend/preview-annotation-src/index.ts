/**
 * Select-element annotation tool injected into previewed pages by the sandbox
 * auth proxy (alongside nav-sync).
 *
 * Lives outside `convex/` and is bundled by `scripts/build-annotation-script.mjs`
 * into `convex/_sandbox_runtime/previewAnnotationScript.generated.ts`. It cannot
 * be embedded via `Function.prototype.toString()` from a Convex module: Convex
 * bundles `convex/` with esbuild `keepNames: true` + `minifyIdentifiers: true`,
 * which rewrites nested functions into `<minified>(fn, "fn")` calls against a
 * module-scope helper. Stringifying only the function body ships those calls
 * without the helper, so the injected copy dies with a ReferenceError before
 * installing a single listener.
 *
 * Runs in the previewed app's page, cross-origin from Eva. No imports.
 */

interface EvaAnnotationContext {
  tagName: string;
  id: string;
  classNames: string[];
  selector: string;
  textContent: string;
  outerHTML: string;
  attributes: Record<string, string>;
  boundingRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  computedStyles: {
    color: string;
    backgroundColor: string;
    fontSize: string;
    fontWeight: string;
    fontFamily: string;
    display: string;
    position: string;
    margin: string;
    padding: string;
    borderRadius: string;
  };
  reactComponents: string[];
  /** Role / aria / focusability summary, e.g. `role="button", focusable`. */
  accessibility: string;
  /** Trimmed text of the parent element (<=150 chars). */
  nearbyText: string;
  /** Up to four sibling identifiers, e.g. `button "Save", div.row (7 total)`. */
  nearbyElements: string;
  /** Readable ancestor path below `html`, crossing shadow boundaries. */
  fullPath: string;
  /** Tag-aware computed styles, e.g. `color: rgb(0, 0, 0); font-size: 14px`. */
  stylesSummary: string;
  environment: {
    viewportWidth: number;
    viewportHeight: number;
    devicePixelRatio: number;
    userAgent: string;
  };
  pageUrl: string;
  pagePath: string;
  capturedAt: number;
}

interface EvaPreviewSnapshotElement {
  role: string;
  name: string;
  selector: string;
  bbox: { x: number; y: number; width: number; height: number };
}

interface EvaPreviewSnapshot {
  url: string;
  title: string;
  loading: boolean;
  visibleText: string;
  interactiveElements: EvaPreviewSnapshotElement[];
  accessibilityTree: Array<{ role: string; name: string }>;
  consoleEntries: Array<{ level: string; text: string; at: number }>;
  networkEntries: Array<{ url: string; status: number; at: number }>;
}

function evaPreviewAnnotationScript(): void {
  const ATTR = "data-eva-annotate";
  /** Computed values that carry no signal, so they never reach the agent. */
  const STYLE_DEFAULTS = [
    "rgba(0, 0, 0, 0)",
    "rgb(0, 0, 0)",
    "none",
    "normal",
    "auto",
    "0px",
    "static",
    "visible",
    "start",
  ];
  const TEXT_TAGS = [
    "p",
    "span",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "a",
    "li",
    "label",
    "strong",
    "em",
    "td",
    "th",
  ];
  const INPUT_TAGS = ["input", "select", "textarea"];
  const MEDIA_TAGS = ["img", "video", "svg", "canvas"];
  const CONTAINER_TAGS = [
    "div",
    "section",
    "main",
    "article",
    "aside",
    "header",
    "footer",
    "nav",
    "ul",
    "ol",
    "form",
  ];
  const FOCUSABLE_SELECTOR = "a, button, input, select, textarea, [tabindex]";
  const root = document.documentElement;
  if (root.getAttribute(ATTR) === "1") {
    return;
  }
  root.setAttribute(ATTR, "1");

  const RING_MAX = 40;
  const CONSOLE_RING: Array<{ level: string; text: string; at: number }> = [];
  const NETWORK_RING: Array<{ url: string; status: number; at: number }> = [];

  function pushRing<T>(ring: T[], entry: T): void {
    ring.push(entry);
    if (ring.length > RING_MAX) {
      ring.splice(0, ring.length - RING_MAX);
    }
  }

  function stringifyConsoleArg(value: unknown): string {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.message;
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }

  function wrapConsole(level: "log" | "info" | "warn" | "error"): void {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      pushRing(CONSOLE_RING, {
        level,
        text: args.map(stringifyConsoleArg).join(" ").slice(0, 400),
        at: Date.now(),
      });
      original(...args);
    };
  }
  wrapConsole("log");
  wrapConsole("info");
  wrapConsole("warn");
  wrapConsole("error");

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    return originalFetch(input, init).then((response) => {
      if (response.status >= 400) {
        pushRing(NETWORK_RING, {
          url: url.slice(0, 300),
          status: response.status,
          at: Date.now(),
        });
      }
      return response;
    });
  };

  let parentOrigin = "*";
  try {
    if (document.referrer) {
      parentOrigin = new URL(document.referrer).origin;
    }
  } catch {
    /* keep "*" */
  }

  let modeActive = false;
  let selectedEl: Element | null = null;
  let overlay: HTMLDivElement | null = null;
  let labelEl: HTMLDivElement | null = null;
  let rectRaf = 0;

  function post(
    payload:
      | { type: "eva-preview-annotate-ready" }
      | {
          type: "eva-preview-annotate-selected";
          context: EvaAnnotationContext;
          rect: {
            top: number;
            left: number;
            width: number;
            height: number;
          };
        }
      | {
          type: "eva-preview-annotate-rect";
          rect: {
            top: number;
            left: number;
            width: number;
            height: number;
          } | null;
        }
      | { type: "eva-preview-annotate-dismissed" }
      | {
          type: "eva-preview-screenshot";
          requestId: string;
          dataUrl: string;
        }
      | {
          type: "eva-preview-screenshot-error";
          requestId: string;
          message: string;
        }
      | {
          type: "eva-preview-snapshot";
          requestId: string;
          snapshot: EvaPreviewSnapshot;
        }
      | {
          type: "eva-preview-snapshot-error";
          requestId: string;
          message: string;
        },
  ): void {
    window.parent.postMessage(payload, parentOrigin);
  }

  function ensureOverlay(): void {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.setAttribute("data-eva-annotate-overlay", "1");
    overlay.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #3b82f6;background:rgba(59,130,246,0.12);border-radius:2px;display:none;box-sizing:border-box;";
    labelEl = document.createElement("div");
    labelEl.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483647;background:#1e293b;color:#f8fafc;font:12px/1.3 ui-sans-serif,system-ui,sans-serif;padding:2px 6px;border-radius:3px;display:none;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    document.documentElement.appendChild(overlay);
    document.documentElement.appendChild(labelEl);
  }

  function escapeCssIdent(value: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function generateSelector(element: HTMLElement): string {
    const parts: string[] = [];
    let current: HTMLElement | null = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += "#" + escapeCssIdent(current.id);
        parts.unshift(selector);
        break;
      }
      if (current.className && typeof current.className === "string") {
        const classes = current.className.trim().split(/\s+/).slice(0, 2);
        if (classes.length > 0 && classes[0]) {
          selector += "." + classes.map((c) => escapeCssIdent(c)).join(".");
        }
      }
      const parentEl: HTMLElement | null = current.parentElement;
      if (parentEl) {
        const currentElement = current;
        const siblings: Element[] = [];
        for (let i = 0; i < parentEl.children.length; i++) {
          const child = parentEl.children.item(i);
          if (child && child.tagName === currentElement.tagName) {
            siblings.push(child);
          }
        }
        if (siblings.length > 1) {
          const index = siblings.indexOf(currentElement) + 1;
          selector += ":nth-of-type(" + index + ")";
        }
      }
      parts.unshift(selector);
      current = parentEl;
    }
    return parts.join(" > ");
  }

  function collectReactNames(element: Element): string[] {
    const names: string[] = [];
    let fiber: object | null = null;
    const keys = Object.keys(element);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!key) continue;
      if (
        !key.startsWith("__reactFiber$") &&
        !key.startsWith("__reactInternalInstance$")
      ) {
        continue;
      }
      const value = Reflect.get(element, key);
      if (value && typeof value === "object") {
        fiber = value;
        break;
      }
    }
    let current = fiber;
    while (current && names.length < 3) {
      const typeVal = Reflect.get(current, "type");
      if (typeof typeVal === "function") {
        const displayName = Reflect.get(typeVal, "displayName");
        const name =
          typeof displayName === "string" && displayName
            ? displayName
            : typeVal.name;
        if (name && names.indexOf(name) === -1) {
          names.push(name);
        }
      }
      const next = Reflect.get(current, "return");
      current = next && typeof next === "object" ? next : null;
    }
    return names;
  }

  /**
   * Drops CSS-module hash suffixes: `card_a1b2c3` -> `card`. Underscore only —
   * a hyphen rule would eat ordinary utility classes (`items-center` ->
   * `items`).
   */
  function stripClassHash(className: string): string {
    return className.replace(/_[a-zA-Z0-9]{5,}$/, "");
  }

  function firstMeaningfulClass(element: Element): string {
    for (let i = 0; i < element.classList.length; i++) {
      const raw = element.classList.item(i);
      if (!raw) continue;
      const stripped = stripClassHash(raw);
      if (stripped.length >= 3) {
        return stripped;
      }
    }
    return "";
  }

  function describeAccessibility(element: Element): string {
    const parts: string[] = [];
    const role = element.getAttribute("role");
    if (role) parts.push('role="' + role + '"');
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) parts.push('aria-label="' + ariaLabel + '"');
    const describedBy = element.getAttribute("aria-describedby");
    if (describedBy) parts.push('aria-describedby="' + describedBy + '"');
    const tabIndex = element.getAttribute("tabindex");
    if (tabIndex) parts.push("tabindex=" + tabIndex);
    if (element.getAttribute("aria-hidden") === "true") {
      parts.push("aria-hidden");
    }
    if (element.matches(FOCUSABLE_SELECTOR)) {
      parts.push("focusable");
    }
    return parts.join(", ");
  }

  function describeNearbyText(element: Element): string {
    const parent = element.parentElement;
    if (!parent) return "";
    return (parent.textContent || "").replace(/\s+/g, " ").trim().slice(0, 150);
  }

  function describeSibling(element: Element): string {
    const tag = element.tagName.toLowerCase();
    const cls = firstMeaningfulClass(element);
    let label = cls ? tag + "." + cls : tag;
    if (tag === "button" || tag === "a") {
      const text = (element.textContent || "").replace(/\s+/g, " ").trim();
      if (text) {
        label += ' "' + text.slice(0, 15) + '"';
      }
    }
    return label;
  }

  function describeNearbyElements(element: Element): string {
    const parent = element.parentElement;
    if (!parent) return "";
    const labels: string[] = [];
    for (let i = 0; i < parent.children.length && labels.length < 4; i++) {
      const child = parent.children.item(i);
      if (!child || child === element) continue;
      labels.push(describeSibling(child));
    }
    if (labels.length === 0) return "";
    let summary = labels.join(", ");
    if (parent.children.length > labels.length + 1) {
      summary += " (" + parent.children.length + " total)";
    }
    return summary;
  }

  function pathSegment(element: Element): string {
    const tag = element.tagName.toLowerCase();
    if (element.id) {
      return tag + "#" + element.id;
    }
    const cls = firstMeaningfulClass(element);
    return cls ? tag + "." + cls : tag;
  }

  function buildFullPath(element: Element): string {
    const parts: string[] = [];
    let current: Element | null = element;
    let crossedShadow = false;
    while (current && current.tagName.toLowerCase() !== "html") {
      parts.unshift((crossedShadow ? "⟨shadow⟩ " : "") + pathSegment(current));
      crossedShadow = false;
      const parent: Element | null = current.parentElement;
      if (parent) {
        current = parent;
        continue;
      }
      const root = current.getRootNode();
      if (root instanceof ShadowRoot) {
        current = root.host;
        crossedShadow = true;
        continue;
      }
      current = null;
    }
    return parts.join(" > ");
  }

  function stylePropertiesFor(element: Element): string[] {
    const tag = element.tagName.toLowerCase();
    if (
      tag === "button" ||
      (tag === "a" && element.getAttribute("role") === "button")
    ) {
      return [
        "background-color",
        "color",
        "padding",
        "border-radius",
        "font-size",
      ];
    }
    if (TEXT_TAGS.indexOf(tag) !== -1) {
      return [
        "color",
        "font-size",
        "font-weight",
        "font-family",
        "line-height",
      ];
    }
    if (INPUT_TAGS.indexOf(tag) !== -1) {
      return [
        "background-color",
        "color",
        "padding",
        "border-radius",
        "font-size",
      ];
    }
    if (MEDIA_TAGS.indexOf(tag) !== -1) {
      return ["width", "height", "object-fit", "border-radius"];
    }
    if (CONTAINER_TAGS.indexOf(tag) !== -1) {
      return ["display", "padding", "margin", "gap", "background-color"];
    }
    return ["color", "font-size", "margin", "padding", "background-color"];
  }

  function describeStyles(element: Element): string {
    const styles = window.getComputedStyle(element);
    const properties = stylePropertiesFor(element);
    const parts: string[] = [];
    for (let i = 0; i < properties.length; i++) {
      const property = properties[i];
      if (!property) continue;
      const value = styles.getPropertyValue(property).trim();
      if (!value || STYLE_DEFAULTS.indexOf(value) !== -1) continue;
      parts.push(property + ": " + value);
    }
    return parts.join("; ");
  }

  function captureContext(element: HTMLElement): EvaAnnotationContext {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    const classNames = Array.from(element.classList);
    const attributes: Record<string, string> = {};
    const attrs = element.attributes;
    for (
      let i = 0;
      i < attrs.length && Object.keys(attributes).length < 20;
      i++
    ) {
      const attr = attrs.item(i);
      if (!attr) continue;
      attributes[attr.name] = attr.value.slice(0, 200);
    }
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || "",
      classNames,
      selector: generateSelector(element),
      textContent: text.slice(0, 300),
      outerHTML: element.outerHTML.slice(0, 2048),
      attributes,
      boundingRect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      computedStyles: {
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        fontSize: styles.fontSize,
        fontWeight: styles.fontWeight,
        fontFamily: styles.fontFamily,
        display: styles.display,
        position: styles.position,
        margin: styles.margin,
        padding: styles.padding,
        borderRadius: styles.borderRadius,
      },
      reactComponents: collectReactNames(element),
      accessibility: describeAccessibility(element),
      nearbyText: describeNearbyText(element),
      nearbyElements: describeNearbyElements(element),
      fullPath: buildFullPath(element),
      stylesSummary: describeStyles(element),
      environment: {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        userAgent: navigator.userAgent,
      },
      pageUrl: window.location.href,
      pagePath: window.location.pathname + window.location.search,
      capturedAt: Date.now(),
    };
  }

  function paintBox(
    target: Element | null,
    label: string,
    selected: boolean,
  ): void {
    ensureOverlay();
    if (!overlay || !labelEl) return;
    if (!target) {
      overlay.style.display = "none";
      labelEl.style.display = "none";
      return;
    }
    const rect = target.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.top = rect.top + "px";
    overlay.style.left = rect.left + "px";
    overlay.style.width = Math.max(0, rect.width) + "px";
    overlay.style.height = Math.max(0, rect.height) + "px";
    overlay.style.borderColor = selected ? "#2563eb" : "#3b82f6";
    overlay.style.background = selected
      ? "rgba(37,99,235,0.16)"
      : "rgba(59,130,246,0.12)";
    labelEl.style.display = "block";
    labelEl.textContent = label;
    const labelTop = Math.max(0, rect.top - 22);
    labelEl.style.top = labelTop + "px";
    labelEl.style.left = Math.max(0, rect.left) + "px";
  }

  function chipLabel(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const rawClass = el.classList.item(0);
    // Fall back to the raw class when the strip consumes all of it (a class
    // that is nothing but a hash), rather than rendering "<div.>".
    const stripped = rawClass ? stripClassHash(rawClass) : "";
    const cls =
      el instanceof HTMLElement && rawClass
        ? "." + (stripped || rawClass)
        : "";
    const react = collectReactNames(el);
    const reactPrefix = react[0] ? react[0] + " " : "";
    return reactPrefix + "<" + tag + cls + ">";
  }

  function clearAll(): void {
    selectedEl = null;
    paintBox(null, "", false);
  }

  function setMode(active: boolean): void {
    modeActive = active;
    document.documentElement.style.cursor = active ? "crosshair" : "";
    if (!active) {
      clearAll();
    }
  }

  function scheduleRectReport(): void {
    if (rectRaf) return;
    rectRaf = window.requestAnimationFrame(() => {
      rectRaf = 0;
      if (!selectedEl || !document.contains(selectedEl)) {
        post({ type: "eva-preview-annotate-rect", rect: null });
        return;
      }
      const rect = selectedEl.getBoundingClientRect();
      post({
        type: "eva-preview-annotate-rect",
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      });
      paintBox(selectedEl, chipLabel(selectedEl), true);
    });
  }

  function onMouseMove(event: MouseEvent): void {
    if (!modeActive) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      target === overlay ||
      target === labelEl ||
      (target instanceof HTMLElement &&
        target.getAttribute("data-eva-annotate-overlay") === "1")
    ) {
      return;
    }
    if (selectedEl) return;
    paintBox(target, chipLabel(target), false);
  }

  function onClick(event: MouseEvent): void {
    if (!modeActive) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (
      target === overlay ||
      target === labelEl ||
      target.getAttribute("data-eva-annotate-overlay") === "1"
    ) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    selectedEl = target;
    const context = captureContext(target);
    const rect = target.getBoundingClientRect();
    paintBox(target, chipLabel(target), true);
    post({
      type: "eva-preview-annotate-selected",
      context,
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    });
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!modeActive) return;
    if (event.key === "Escape") {
      event.preventDefault();
      clearAll();
      post({ type: "eva-preview-annotate-dismissed" });
    }
  }

  function onScrollOrResize(): void {
    if (!modeActive || !selectedEl) return;
    scheduleRectReport();
  }

  function implicitRole(element: HTMLElement): string {
    const explicit = element.getAttribute("role");
    if (explicit) return explicit;
    const tag = element.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "main") return "main";
    if (tag === "nav") return "navigation";
    if (tag === "header") return "banner";
    if (tag === "footer") return "contentinfo";
    if (tag === "aside") return "complementary";
    if (
      tag === "h1" ||
      tag === "h2" ||
      tag === "h3" ||
      tag === "h4" ||
      tag === "h5" ||
      tag === "h6"
    ) {
      return "heading";
    }
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      const type = (element.getAttribute("type") || "text").toLowerCase();
      if (type === "checkbox" || type === "radio") return type;
      if (type === "submit" || type === "button" || type === "reset") {
        return "button";
      }
      return "textbox";
    }
    if (element.isContentEditable) return "textbox";
    return tag;
  }

  function accessibleName(element: HTMLElement): string {
    const labelled = element.getAttribute("aria-label");
    if (labelled) return labelled.replace(/\s+/g, " ").trim().slice(0, 80);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const fromLabel = element.labels?.item(0)?.textContent;
      if (fromLabel) return fromLabel.replace(/\s+/g, " ").trim().slice(0, 80);
      const placeholder = element.getAttribute("placeholder");
      if (placeholder) return placeholder.slice(0, 80);
      return (element.value || "").slice(0, 80);
    }
    if (element instanceof HTMLImageElement) {
      return (element.alt || "").slice(0, 80);
    }
    return (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function isVisibleBox(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const styles = window.getComputedStyle(element);
    if (styles.visibility === "hidden" || styles.display === "none") {
      return false;
    }
    if (styles.opacity === "0") return false;
    return true;
  }

  function collectInteractive(): EvaPreviewSnapshotElement[] {
    const selector =
      "a[href], button, input, select, textarea, [role='button'], [role='link'], [role='tab'], [contenteditable='true']";
    const nodes = document.querySelectorAll(selector);
    const out: EvaPreviewSnapshotElement[] = [];
    for (let i = 0; i < nodes.length && out.length < 80; i++) {
      const node = nodes.item(i);
      if (!(node instanceof HTMLElement)) continue;
      if (node.getAttribute("aria-hidden") === "true") continue;
      if (!isVisibleBox(node)) continue;
      const rect = node.getBoundingClientRect();
      out.push({
        role: implicitRole(node),
        name: accessibleName(node),
        selector: generateSelector(node),
        bbox: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }
    return out;
  }

  function collectA11yTree(): Array<{ role: string; name: string }> {
    const selector =
      "main, nav, header, footer, aside, h1, h2, h3, h4, h5, h6, [role='main'], [role='navigation'], [role='banner'], [role='contentinfo'], [role='complementary']";
    const nodes = document.querySelectorAll(selector);
    const out: Array<{ role: string; name: string }> = [];
    for (let i = 0; i < nodes.length && out.length < 40; i++) {
      const node = nodes.item(i);
      if (!(node instanceof HTMLElement)) continue;
      out.push({
        role: implicitRole(node),
        name: accessibleName(node),
      });
    }
    return out;
  }

  function collectSnapshot(): EvaPreviewSnapshot {
    const bodyText = (document.body?.innerText || "")
      .replace(/\s+/g, " ")
      .trim();
    return {
      url: window.location.href,
      title: document.title || "",
      loading: document.readyState !== "complete",
      visibleText: bodyText.slice(0, 4000),
      interactiveElements: collectInteractive(),
      accessibilityTree: collectA11yTree(),
      consoleEntries: CONSOLE_RING.slice(),
      networkEntries: NETWORK_RING.slice(),
    };
  }

  function restoreCaptureChrome(): void {
    if (overlay) overlay.style.display = overlayDisplayForCapture;
    if (labelEl) labelEl.style.display = labelDisplayForCapture;
  }

  let overlayDisplayForCapture = "";
  let labelDisplayForCapture = "";

  function loadHtml2Canvas(): Promise<void> {
    if (typeof Reflect.get(window, "html2canvas") === "function") {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/__eva_preview_proxy/html2canvas.js";
      script.onload = () => {
        if (typeof Reflect.get(window, "html2canvas") === "function") {
          resolve();
          return;
        }
        reject(new Error("Couldn't render this page as an image"));
      };
      script.onerror = () => {
        reject(new Error("Couldn't render this page as an image"));
      };
      document.documentElement.appendChild(script);
    });
  }

  function renderViewportCanvas(): Promise<HTMLCanvasElement> {
    const html2canvas = Reflect.get(window, "html2canvas");
    if (typeof html2canvas !== "function") {
      return Promise.reject(new Error("Couldn't render this page as an image"));
    }
    const result = html2canvas.call(window, document.documentElement, {
      width: window.innerWidth,
      height: window.innerHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      x: window.scrollX,
      y: window.scrollY,
      scrollX: -window.scrollX,
      scrollY: -window.scrollY,
      useCORS: true,
      logging: false,
      backgroundColor: null,
    });
    if (!(result instanceof Promise)) {
      return Promise.reject(new Error("Couldn't render this page as an image"));
    }
    return result.then((canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Couldn't render this page as an image");
      }
      return canvas;
    });
  }

  function captureViewport(): Promise<string> {
    overlayDisplayForCapture = overlay?.style.display ?? "";
    labelDisplayForCapture = labelEl?.style.display ?? "";
    if (overlay) overlay.style.display = "none";
    if (labelEl) labelEl.style.display = "none";
    return loadHtml2Canvas()
      .then(renderViewportCanvas)
      .then((canvas) => canvas.toDataURL("image/png"))
      .finally(restoreCaptureChrome);
  }

  window.addEventListener("message", (event) => {
    if (parentOrigin !== "*" && event.origin !== parentOrigin) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    const type = Reflect.get(data, "type");
    if (type === "eva-preview-annotate-mode") {
      const active = Reflect.get(data, "active") === true;
      setMode(active);
      return;
    }
    if (type === "eva-preview-annotate-clear") {
      clearAll();
      return;
    }
    if (type === "eva-preview-screenshot-capture") {
      const requestId = Reflect.get(data, "requestId");
      if (typeof requestId !== "string") return;
      void captureViewport()
        .then((dataUrl) => {
          post({ type: "eva-preview-screenshot", requestId, dataUrl });
        })
        .catch((error) => {
          post({
            type: "eva-preview-screenshot-error",
            requestId,
            message:
              error instanceof Error
                ? error.message
                : "Couldn't render this page as an image",
          });
        });
      return;
    }
    if (type === "eva-preview-snapshot-capture") {
      const requestId = Reflect.get(data, "requestId");
      if (typeof requestId !== "string") return;
      try {
        post({
          type: "eva-preview-snapshot",
          requestId,
          snapshot: collectSnapshot(),
        });
      } catch (error) {
        post({
          type: "eva-preview-snapshot-error",
          requestId,
          message:
            error instanceof Error
              ? error.message
              : "Couldn't snapshot this page",
        });
      }
    }
  });

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize);

  post({ type: "eva-preview-annotate-ready" });
}

// A throw here would silently disable annotations, exactly the failure mode the
// build step exists to prevent. Log loudly so the iframe console names it.
try {
  evaPreviewAnnotationScript();
} catch (error) {
  console.error("[eva] preview annotation script failed to start", error);
}

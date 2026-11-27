import type { HookInfo, ReactComponentNode } from "@/shared/types";

export interface FiberNode {
  type: unknown;
  key: string | null;
  memoizedProps: Record<string, unknown>;
  memoizedState: unknown;
  child: FiberNode | null;
  sibling: FiberNode | null;
  return: FiberNode | null;
  stateNode: unknown;
  tag: number;
}

interface ReactDevToolsHook {
  renderers: Map<number, unknown>;
  supportsFiber: boolean;
}

declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevToolsHook;
  }
}

const FIBER_TAGS = {
  FunctionComponent: 0,
  ClassComponent: 1,
  HostRoot: 3,
  HostComponent: 5,
  HostText: 6,
  Fragment: 7,
  ContextProvider: 10,
  ForwardRef: 11,
  MemoComponent: 14,
  SimpleMemoComponent: 15,
};

export function getComponentName(fiber: FiberNode): string {
  const { type, tag } = fiber;

  if (tag === FIBER_TAGS.HostText) {
    return "#text";
  }

  if (tag === FIBER_TAGS.HostComponent) {
    return typeof type === "string" ? type : "Unknown";
  }

  if (tag === FIBER_TAGS.Fragment) {
    return "Fragment";
  }

  if (typeof type === "function") {
    if (
      "displayName" in type &&
      typeof type.displayName === "string" &&
      type.displayName.length > 0
    ) {
      return type.displayName;
    }
    return type.name || "Anonymous";
  }

  if (typeof type === "object" && type !== null) {
    if ("displayName" in type && typeof type.displayName === "string") {
      return type.displayName;
    }
    if (
      "render" in type &&
      typeof type.render === "object" &&
      type.render !== null
    ) {
      const { render } = type;
      if ("displayName" in render && typeof render.displayName === "string") {
        return render.displayName;
      }
      if ("name" in render && typeof render.name === "string") {
        return render.name;
      }
      return "ForwardRef";
    }
  }

  return "Unknown";
}

function getNodeType(
  fiber: FiberNode,
): "component" | "element" | "fragment" | "text" {
  const { tag } = fiber;

  if (tag === FIBER_TAGS.HostText) {
    return "text";
  }

  if (tag === FIBER_TAGS.HostComponent) {
    return "element";
  }

  if (tag === FIBER_TAGS.Fragment) {
    return "fragment";
  }

  return "component";
}

function sanitizeValue(value: unknown, depth = 0, maxDepth = 3): unknown {
  if (depth > maxDepth) {
    return "[Max depth reached]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (typeof value === "symbol") {
    return value.toString();
  }

  if (typeof value === "string") {
    return value.length > 200 ? value.slice(0, 200) + "..." : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof HTMLElement) {
    return `[HTMLElement: ${value.tagName.toLowerCase()}]`;
  }

  if (Array.isArray(value)) {
    if (value.length > 10) {
      return `[Array(${value.length})]`;
    }
    return value.slice(0, 10).map((v) => sanitizeValue(v, depth + 1, maxDepth));
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    const record: Record<string, unknown> = { ...value };
    const keys = Object.keys(record);

    if (keys.length > 20) {
      return `[Object with ${keys.length} keys]`;
    }

    for (const key of keys.slice(0, 20)) {
      if (key.startsWith("__") || key.startsWith("$$")) {
        continue;
      }
      result[key] = sanitizeValue(record[key], depth + 1, maxDepth);
    }
    return result;
  }

  return String(value);
}

function sanitizeProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props || {})) {
    if (key === "children" || key.startsWith("__") || key.startsWith("$$")) {
      continue;
    }
    result[key] = sanitizeValue(value);
  }

  return result;
}

function extractHooks(fiber: FiberNode): HookInfo[] {
  const hooks: HookInfo[] = [];

  if (
    fiber.tag !== FIBER_TAGS.FunctionComponent &&
    fiber.tag !== FIBER_TAGS.ForwardRef &&
    fiber.tag !== FIBER_TAGS.SimpleMemoComponent
  ) {
    return hooks;
  }

  let hookNode: unknown = fiber.memoizedState;
  let hookIndex = 0;

  while (hookNode && typeof hookNode === "object" && "next" in hookNode) {
    const memoizedState: unknown =
      "memoizedState" in hookNode ? hookNode.memoizedState : undefined;
    const hookType = inferHookType({ memoizedState }, hookIndex);

    hooks.push({
      type: hookType,
      value: sanitizeValue(memoizedState, 0, 2),
    });

    hookNode = hookNode.next;
    hookIndex++;
  }

  return hooks;
}

function inferHookType(
  hook: { memoizedState: unknown },
  index: number,
): string {
  const state = hook.memoizedState;

  if (Array.isArray(state) && state.length === 2) {
    if (typeof state[1] === "function") {
      return "useState";
    }
  }

  if (typeof state === "object" && state !== null && "current" in state) {
    return "useRef";
  }

  if (typeof state === "object" && state !== null && "deps" in state) {
    return "useEffect/useMemo/useCallback";
  }

  return `hook_${index}`;
}

function extractState(fiber: FiberNode): Record<string, unknown> | null {
  const instance = fiber.stateNode;
  if (
    fiber.tag === FIBER_TAGS.ClassComponent &&
    typeof instance === "object" &&
    instance !== null &&
    "state" in instance &&
    instance.state
  ) {
    const sanitized = sanitizeValue(instance.state, 0, 3);
    if (typeof sanitized === "object" && sanitized !== null) {
      return { ...sanitized };
    }
  }

  return null;
}

function isRelevantNode(fiber: FiberNode): boolean {
  const { tag } = fiber;
  return (
    tag === FIBER_TAGS.FunctionComponent ||
    tag === FIBER_TAGS.ClassComponent ||
    tag === FIBER_TAGS.HostComponent ||
    tag === FIBER_TAGS.ForwardRef ||
    tag === FIBER_TAGS.MemoComponent ||
    tag === FIBER_TAGS.SimpleMemoComponent ||
    tag === FIBER_TAGS.Fragment
  );
}

function traverseFiber(
  fiber: FiberNode,
  depth: number,
  maxDepth = 10,
): ReactComponentNode {
  const node: ReactComponentNode = {
    name: getComponentName(fiber),
    type: getNodeType(fiber),
    props: sanitizeProps(fiber.memoizedProps || {}),
    state: extractState(fiber),
    hooks: extractHooks(fiber),
    children: [],
    depth,
    key: fiber.key,
  };

  if (depth >= maxDepth) {
    return node;
  }

  let child = fiber.child;
  while (child) {
    if (isRelevantNode(child)) {
      node.children.push(traverseFiber(child, depth + 1, maxDepth));
    } else {
      let grandChild = child.child;
      while (grandChild) {
        if (isRelevantNode(grandChild)) {
          node.children.push(traverseFiber(grandChild, depth + 1, maxDepth));
        }
        grandChild = grandChild.sibling;
      }
    }
    child = child.sibling;
  }

  return node;
}

function isFiberNode(value: unknown): value is FiberNode {
  return typeof value === "object" && value !== null && "tag" in value;
}

export function getFiber(element: HTMLElement): FiberNode | null {
  const fiberKey = Object.keys(element).find(
    (key) =>
      key.startsWith("__reactFiber$") ||
      key.startsWith("__reactInternalInstance$"),
  );
  if (!fiberKey) return null;
  const fiber: unknown = Reflect.get(element, fiberKey);
  return isFiberNode(fiber) ? fiber : null;
}

export function countFiberHooks(fiber: FiberNode | null): number {
  if (!fiber) return 0;
  let count = 0;
  let hook: unknown = fiber.memoizedState;
  while (hook && typeof hook === "object") {
    count++;
    hook = "next" in hook ? hook.next : null;
  }
  return count;
}

export function countFiberProps(fiber: FiberNode | null): number {
  if (!fiber || !fiber.memoizedProps) return 0;
  return Object.keys(fiber.memoizedProps).filter((k) => k !== "children")
    .length;
}

export function generateSelector(element: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector += `#${CSS.escape(current.id)}`;
      parts.unshift(selector);
      break;
    }

    if (current.className && typeof current.className === "string") {
      const classes = current.className.trim().split(/\s+/).slice(0, 2);
      if (classes.length > 0 && classes[0]) {
        selector += `.${classes.map((c) => CSS.escape(c)).join(".")}`;
      }
    }

    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      const currentElement = current;
      const siblings = Array.from(parent.children).filter(
        (el) => el.tagName === currentElement.tagName,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(currentElement) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(selector);
    current = parent;
  }

  return parts.join(" > ");
}

export function countComponents(node: ReactComponentNode): number {
  let count = node.type === "component" ? 1 : 0;
  for (const child of node.children) {
    count += countComponents(child);
  }
  return count;
}

export function detectReactVersion(): string {
  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook || !hook.renderers) {
    return "unknown";
  }

  for (const renderer of hook.renderers.values()) {
    if (
      typeof renderer === "object" &&
      renderer !== null &&
      "version" in renderer &&
      typeof renderer.version === "string"
    ) {
      return renderer.version;
    }
  }

  return "unknown";
}

export function isReactAvailable(): boolean {
  return !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.supportsFiber;
}

export interface ReactTreeResult {
  tree: ReactComponentNode;
  metadata: {
    reactVersion: string;
    totalComponents: number;
    capturedAt: number;
    sourceUrl: string;
    elementSelector: string;
  };
}

export function extractReactTree(element: HTMLElement): ReactTreeResult | null {
  if (!isReactAvailable()) {
    return null;
  }

  const fiber = getFiber(element);
  if (!fiber) {
    return null;
  }

  let componentFiber: FiberNode | null = fiber;
  while (
    componentFiber &&
    componentFiber.tag !== FIBER_TAGS.FunctionComponent &&
    componentFiber.tag !== FIBER_TAGS.ClassComponent &&
    componentFiber.tag !== FIBER_TAGS.HostComponent
  ) {
    componentFiber = componentFiber.return;
  }

  if (!componentFiber) {
    componentFiber = fiber;
  }

  const tree = traverseFiber(componentFiber, 0);

  return {
    tree,
    metadata: {
      reactVersion: detectReactVersion(),
      totalComponents: countComponents(tree),
      capturedAt: Date.now(),
      sourceUrl: window.location.href,
      elementSelector: generateSelector(element),
    },
  };
}

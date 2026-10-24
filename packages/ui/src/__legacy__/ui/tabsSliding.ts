/** transitions.dev tabs sliding — see 16-tabs-sliding.md */

function findActiveTab(list: HTMLElement): HTMLElement | null {
  const tabs = list.querySelectorAll<HTMLElement>(".t-tab");
  for (const tab of tabs) {
    if (
      tab.getAttribute("aria-selected") === "true" ||
      tab.getAttribute("data-state") === "active"
    ) {
      return tab;
    }
  }
  if (tabs.length === 0) {
    return null;
  }
  return tabs[0];
}

function moveTabsPill(
  pill: HTMLElement,
  tab: HTMLElement,
  animate: boolean,
): void {
  // Both axes on transform so a column list (sandbox rail) slides the same
  // way a row does. `top` stayed a layout property and never tweened.
  const x = tab.offsetLeft;
  const y = tab.offsetTop;
  const width = tab.offsetWidth;
  const height = tab.offsetHeight;
  const transform = `translate(${x}px, ${y}px)`;

  if (!animate) {
    const previousTransition = pill.style.transition;
    pill.style.transition = "none";
    pill.style.top = "0px";
    pill.style.transform = transform;
    pill.style.width = `${width}px`;
    pill.style.height = `${height}px`;
    void pill.offsetWidth;
    pill.style.transition = previousTransition;
    return;
  }

  pill.style.top = "0px";
  pill.style.transform = transform;
  pill.style.width = `${width}px`;
  pill.style.height = `${height}px`;
}

export function syncTabsPill(
  list: HTMLElement,
  pill: HTMLElement,
  animate: boolean,
): void {
  const tab = findActiveTab(list);
  if (tab) {
    moveTabsPill(pill, tab, animate);
  }
}

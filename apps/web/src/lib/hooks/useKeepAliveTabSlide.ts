import { useState } from "react";

type Slide = {
  current: string;
  leaving: string | null;
  direction: 1 | -1 | null;
};

/**
 * The tab slide (`TabsTransition`) for tab sets that keep every pane mounted
 * and hide the inactive ones with `invisible`. `TabsTransition` keys and
 * unmounts its panel, which would drop the panes' drafts and scroll. Spread
 * `container` on the panes' parent and `pane(tab)` on each pane; globals.css
 * (`data-tab-pane`) slides the new pane in from the picked tab's side and the
 * old one out the other way. Nothing moves before the first switch, so the
 * first paint does not slide.
 */
export function useKeepAliveTabSlide(
  value: string,
  order: ReadonlyArray<string>,
) {
  const [slide, setSlide] = useState<Slide>({
    current: value,
    leaving: null,
    direction: null,
  });
  if (value !== slide.current) {
    setSlide({
      current: value,
      leaving: slide.current,
      direction: order.indexOf(value) >= order.indexOf(slide.current) ? 1 : -1,
    });
  }
  return {
    container:
      slide.direction === null ? {} : { "data-tab-dir": String(slide.direction) },
    pane: (tab: string) => ({
      "data-tab-pane":
        tab === value ? "active" : tab === slide.leaving ? "leaving" : "inactive",
    }),
  };
}

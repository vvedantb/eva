"use client";

import { MotionConfig } from "motion/react";
import {
  createContext,
  useContext,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { useLocalStorage } from "usehooks-ts";
import {
  applyPageMotionDataset,
  DISABLE_PAGE_MOTION_KEY,
} from "@/lib/pageMotion";

const PageMotionContext = createContext<{
  disabled: boolean;
  setDisabled: (disabled: boolean) => void;
}>({
  disabled: false,
  setDisabled: () => {},
});

/**
 * Experimental page-motion gate. `disabled` zeros Motion.js enters/layout
 * (`reducedMotion: always`) and stamps `html[data-page-motion=off]` for the
 * CSS page/panel/modal keyframes. Hover marquee, loaders, composer beam, and
 * the sessions Drive loader are not targeted.
 */
export function PageMotionProvider({ children }: { children: ReactNode }) {
  const [disabled, setDisabled] = useLocalStorage(
    DISABLE_PAGE_MOTION_KEY,
    false,
  );

  useLayoutEffect(() => {
    applyPageMotionDataset(disabled);
  }, [disabled]);

  return (
    <PageMotionContext.Provider value={{ disabled, setDisabled }}>
      <MotionConfig reducedMotion={disabled ? "always" : "never"}>
        {children}
      </MotionConfig>
    </PageMotionContext.Provider>
  );
}

export function useDisablePageMotion(): boolean {
  return useContext(PageMotionContext).disabled;
}

export function useDisablePageMotionToggle(): {
  disabled: boolean;
  setDisabled: (disabled: boolean) => void;
} {
  return useContext(PageMotionContext);
}

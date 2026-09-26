import { IconPointerFilled } from "@tabler/icons-react";
import { m } from "motion/react";
import { useDeckStep } from "../../_components/DeckPrimitives";
import {
  BRAND,
  BRAND_GRADIENT,
  DUR,
  EASE,
  LEAVE,
} from "../../_components/motion";
import { FriLines, FriWindow } from "./FriMock";

/** The pointer arrives, presses, and the button answers. */
const CLICK_AT = 1.05;

export function MoF1PreviewPanel() {
  const live = useDeckStep() >= 2;
  return (
    <FriWindow
      label="Live preview"
      className="h-full w-full"
      bodyClassName="relative flex flex-col gap-3"
    >
      <div className="flex h-6 items-center gap-2 rounded-[10px] bg-white/[0.07] px-2">
        <span
          className="size-3 rounded-[4px]"
          style={{ background: BRAND_GRADIENT }}
        />
        <span className="h-1.5 w-14 rounded-full bg-white/[0.14]" />
        <span className="ml-auto size-3.5 rounded-full bg-white/[0.14]" />
      </div>
      <div className="flex items-start gap-3 rounded-[12px] bg-white/[0.04] p-3">
        <span className="size-7 shrink-0 rounded-full bg-gradient-to-br from-[#8B3FB8]/70 to-[#3B7DD8]/70" />
        <FriLines
          widths={[150, 110, 128]}
          height={6}
          className="gap-2 pt-0.5"
        />
      </div>
      <div className="relative mt-auto w-fit">
        <m.div
          className="rounded-full px-3.5 py-1.5 text-[12px] font-medium text-white"
          style={{ background: BRAND_GRADIENT }}
          initial={{ opacity: 0, scale: 0.9, y: 6 }}
          animate={
            live
              ? { opacity: 1, y: 0, scale: [0.9, 1, 1, 0.93, 1] }
              : { opacity: 0, scale: 0.9, y: 6 }
          }
          transition={
            live
              ? {
                  duration: CLICK_AT + 0.35,
                  times: [0, 0.3, 0.76, 0.86, 1],
                  ease: EASE.out,
                  delay: 0.25,
                  opacity: { duration: DUR.base, delay: 0.25 },
                  y: { duration: DUR.slow, ease: EASE.expo, delay: 0.25 },
                }
              : LEAVE
          }
        >
          Decline
        </m.div>
        {live && (
          <m.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ border: `1.5px solid ${BRAND.blue}` }}
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 0.8, 0], scale: [1, 1.7] }}
            transition={{
              duration: 0.8,
              ease: EASE.out,
              delay: CLICK_AT + 0.3,
            }}
          />
        )}
      </div>
      <m.div
        aria-hidden
        className="absolute bottom-3 left-[78px] text-white"
        initial={{ opacity: 0, x: 120, y: -70 }}
        animate={
          live ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: 120, y: -70 }
        }
        transition={
          live
            ? {
                duration: 0.9,
                ease: EASE.inOut,
                delay: 0.45,
                opacity: { duration: DUR.base, delay: 0.45 },
              }
            : LEAVE
        }
      >
        <IconPointerFilled size={20} />
      </m.div>
    </FriWindow>
  );
}

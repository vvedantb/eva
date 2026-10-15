import type { ReactNode } from "react";
import { m } from "motion/react";
import type { Transition } from "motion/react";
import { BRAND_GRADIENT, DUR, EASE } from "../../_components/motion";

/**
 * The whole device reshapes on one layout move, so every part uses the same
 * curve. Layout animations run on transforms, and each nested `layout` node
 * corrects its own scale, so bars and bubbles keep their shape mid-move.
 */
const RESHAPE: Transition = { duration: 1, ease: EASE.expo };
const FADE: Transition = { duration: DUR.fast, ease: EASE.out };

function Bar({
  width,
  tone = "bg-white/12",
}: {
  width: string;
  tone?: string;
}) {
  return (
    <m.span
      layout
      transition={RESHAPE}
      className={`block h-2 rounded-full ${tone}`}
      style={{ width }}
    />
  );
}

function Bubble({ user = false, rows }: { user?: boolean; rows: string[] }) {
  return (
    <m.div
      layout
      transition={RESHAPE}
      className={`flex flex-col gap-1.5 rounded-[10px] p-2.5 ${
        user ? "ml-auto w-[62%] bg-[#3B7DD8]/25" : "w-[78%] bg-white/[0.06]"
      }`}
    >
      {rows.map((width, index) => (
        <Bar
          key={`${width}-${index}`}
          width={width}
          tone={user ? "bg-white/30" : "bg-white/12"}
        />
      ))}
    </m.div>
  );
}

/** A side pane that folds away when the screen gets narrow. */
function SidePane({
  phone,
  width,
  children,
}: {
  phone: boolean;
  width: number;
  children: ReactNode;
}) {
  return (
    <m.div
      layout
      transition={RESHAPE}
      className="shrink-0 overflow-hidden rounded-[10px] bg-white/[0.05]"
      style={{ width: phone ? 0 : width, padding: phone ? 0 : 12 }}
    >
      <m.div
        layout
        transition={RESHAPE}
        animate={{ opacity: phone ? 0 : 1 }}
        style={{ width: width - 24 }}
      >
        {children}
      </m.div>
    </m.div>
  );
}

export function MoF2Device({ phone }: { phone: boolean }) {
  return (
    <m.div
      layout
      transition={RESHAPE}
      className="relative bg-white/[0.06] ring-1 ring-white/10"
      style={{
        width: phone ? 248 : 620,
        height: phone ? 380 : 318,
        borderRadius: phone ? 36 : 22,
        padding: phone ? 10 : 8,
      }}
    >
      <m.div
        layout
        transition={RESHAPE}
        className="flex h-full gap-3 bg-[#0b0c11] p-3 ring-1 ring-white/[0.06]"
        style={{ borderRadius: phone ? 26 : 14 }}
      >
        <SidePane phone={phone} width={130}>
          <div className="space-y-3">
            {[82, 64, 74, 56, 68].map((width, index) => (
              <div key={width} className="flex items-center gap-2">
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    index === 0 ? "bg-[#3B7DD8]" : "bg-white/15"
                  }`}
                />
                <span
                  className={`block h-2 rounded-full ${
                    index === 0 ? "bg-white/30" : "bg-white/12"
                  }`}
                  style={{ width: `${width}%` }}
                />
              </div>
            ))}
          </div>
        </SidePane>

        <m.div
          layout
          transition={RESHAPE}
          className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-hidden rounded-[10px] bg-white/[0.05] p-3"
          style={{ paddingTop: phone ? 26 : 12 }}
        >
          <Bubble rows={["100%", "84%", "60%"]} />
          <Bubble user rows={["100%", "70%"]} />
          <Bubble rows={["100%", "92%", "76%", "48%"]} />
          <m.div
            layout
            transition={RESHAPE}
            className="mt-auto flex h-9 items-center gap-2 rounded-full bg-white/[0.07] pr-1 pl-3"
          >
            <Bar width="46%" tone="bg-white/12" />
            <m.span
              layout
              transition={RESHAPE}
              className="ml-auto size-7 shrink-0 rounded-full"
              style={{ background: BRAND_GRADIENT }}
            />
          </m.div>
        </m.div>

        <SidePane phone={phone} width={150}>
          <div className="flex gap-1">
            {[0, 1, 2].map((dot) => (
              <span key={dot} className="size-1.5 rounded-full bg-white/20" />
            ))}
          </div>
          <div
            className="mt-2.5 h-20 rounded-[8px]"
            style={{
              background:
                "linear-gradient(135deg, rgba(139,63,184,0.35), rgba(59,125,216,0.25))",
            }}
          />
          <div className="mt-3 space-y-2">
            {[90, 70, 80].map((width) => (
              <span
                key={width}
                className="block h-2 rounded-full bg-white/12"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        </SidePane>
      </m.div>

      {/* The phone's notch arrives with the phone shape. */}
      <m.span
        aria-hidden
        className="absolute top-[18px] left-1/2 h-[14px] w-[64px] -translate-x-1/2 rounded-full bg-black ring-1 ring-white/10"
        initial={false}
        animate={{ opacity: phone ? 1 : 0, scale: phone ? 1 : 0.6 }}
        transition={phone ? { ...RESHAPE, delay: 0.35 } : FADE}
      />
    </m.div>
  );
}

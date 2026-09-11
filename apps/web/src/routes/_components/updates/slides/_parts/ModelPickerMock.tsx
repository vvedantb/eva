import { AnimatePresence, m } from "motion/react";
import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "@eva/ui";
import { BRAND, EASE_OUT, useDeckStep } from "../../_components/DeckPrimitives";

const ROWS: readonly { name: string; meta: string }[] = [
  { name: "Opus", meta: "Anthropic" },
  { name: "Sonnet", meta: "Anthropic" },
  { name: "Haiku", meta: "Anthropic" },
  { name: "Opus 4.6", meta: "Anthropic" },
  { name: "Fable 5.1", meta: "Anthropic" },
  { name: "GPT-5.6 Sol", meta: "OpenAI" },
  { name: "GPT-5.6 Terra", meta: "OpenAI" },
  { name: "GPT-5.5", meta: "OpenAI" },
  { name: "Grok 4.6", meta: "xAI" },
  { name: "Grok 4.5", meta: "xAI" },
  { name: "Gemini 3.1 Pro", meta: "Google" },
  { name: "Composer 2.5", meta: "Cursor" },
];

const HIGHLIGHTED = "Fable 5.1";
const TRAITS: readonly string[] = ["Reasoning · High", "1M context", "Fast"];

const STEPS: readonly string[] = [
  "Composer",
  "Grok 4.5",
  "Grok 4.6",
  "Opus",
  "Fable",
];
const TRACK_W = 480;
const PAD = 12;
const GAP = (TRACK_W - PAD * 2) / (STEPS.length - 1);
const tickX = (index: number) => PAD + index * GAP;
const ACTIVE = STEPS.length - 1;

function ModelRow({ name, meta, index }: { name: string; meta: string; index: number }) {
  return (
    <m.div
      className={cn(
        "flex items-center gap-3 overflow-hidden rounded-lg px-3",
        name === HIGHLIGHTED && "bg-white/[0.08]",
      )}
      initial={{ opacity: 0, height: 40, y: 6 }}
      animate={{ opacity: 1, height: 40, y: 0 }}
      exit={{
        opacity: 0,
        height: 0,
        y: -6,
        transition: { duration: 0.3, ease: EASE_OUT, delay: index * 0.03 },
      }}
      transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.15 + index * 0.04 }}
    >
      <span className="size-2 shrink-0 rounded-full bg-white/25" />
      <span className="flex-1 text-sm text-white/80">{name}</span>
      <span className="text-xs text-white/25">{meta}</span>
    </m.div>
  );
}

function Slider() {
  return (
    <m.div
      className="px-2 pt-2 pb-1"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.35 }}
    >
      <div className="relative h-5" style={{ width: TRACK_W }}>
        <div className="absolute inset-0 rounded-full bg-white/[0.08]" />
        <m.div
          className="absolute top-0 left-0 h-5 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
          }}
          initial={{ width: tickX(0) }}
          animate={{ width: tickX(ACTIVE) }}
          transition={{ type: "spring", bounce: 0, duration: 1.2, delay: 0.5 }}
        />
        {STEPS.map((label, index) => (
          <div
            key={label}
            className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30"
            style={{ left: tickX(index) }}
          />
        ))}
        <m.div
          className="absolute top-1/2 size-6 -translate-y-1/2 rounded-full bg-white shadow-lg"
          initial={{ x: tickX(0) - 12 }}
          animate={{ x: tickX(ACTIVE) - 12 }}
          transition={{ type: "spring", bounce: 0, duration: 1.2, delay: 0.5 }}
        />
      </div>

      <div className="relative mt-3 h-4" style={{ width: TRACK_W }}>
        {STEPS.map((label, index) => (
          <span
            key={label}
            className={cn(
              "absolute -translate-x-1/2 text-xs whitespace-nowrap",
              index === ACTIVE ? "text-white" : "text-white/50",
            )}
            style={{ left: tickX(index) }}
          >
            {label}
          </span>
        ))}
      </div>

      <div
        className="mt-4 flex items-center justify-between text-xs text-white/40"
        style={{ width: TRACK_W }}
      >
        <span>Faster</span>
        <span>Smarter</span>
      </div>

      <div
        className="mt-4 flex items-center justify-end gap-0.5 text-xs text-white/55"
        style={{ width: TRACK_W }}
      >
        Advanced
        <IconChevronRight size={14} />
      </div>
    </m.div>
  );
}

function Toggle({ simple }: { simple: boolean }) {
  return (
    <div className="flex rounded-full bg-white/[0.06] p-[3px] text-xs">
      {["Before", "After"].map((label) => {
        const on = (label === "After") === simple;
        return (
          <span
            key={label}
            className="relative w-[52px] py-1 text-center"
          >
            {on ? (
              <m.span
                layoutId="model-picker-toggle-thumb"
                className="absolute inset-0 rounded-full bg-white/[0.14]"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            ) : null}
            <span
              className={cn("relative", on ? "text-white" : "text-white/40")}
            >
              {label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** A mock of the composer's model picker: the long list, then the slider. */
export function ModelPickerMock() {
  const simple = useDeckStep() >= 1;

  return (
    <m.div layout className="w-[560px] rounded-2xl bg-white/[0.05] p-5">
      <m.div layout className="flex items-center justify-between">
        <span className="text-sm font-medium text-white/70">Model</span>
        <Toggle simple={simple} />
      </m.div>

      <AnimatePresence initial={false}>
        {simple ? null : (
          <m.div
            key="traits"
            className="mt-4 flex gap-2 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            {TRAITS.map((trait) => (
              <span
                key={trait}
                className="rounded-full bg-white/[0.06] px-3 py-1 text-xs whitespace-nowrap text-white/55"
              >
                {trait}
              </span>
            ))}
          </m.div>
        )}
      </AnimatePresence>

      <m.div layout className="relative mt-3">
        <AnimatePresence initial={false}>
          {simple
            ? null
            : ROWS.map((row, index) => (
                <ModelRow
                  key={row.name}
                  name={row.name}
                  meta={row.meta}
                  index={index}
                />
              ))}
        </AnimatePresence>

        <AnimatePresence>{simple ? <Slider key="slider" /> : null}</AnimatePresence>

        {simple ? null : (
          <div className="absolute top-2 right-0 h-28 w-[3px] rounded-full bg-white/15" />
        )}
      </m.div>
    </m.div>
  );
}

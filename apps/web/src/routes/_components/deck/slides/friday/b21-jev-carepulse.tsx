import type { Icon } from "@tabler/icons-react";
import {
  IconAlertTriangle,
  IconLock,
  IconRulerMeasure,
  IconSend,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import {
  useAppScheme,
  Accent,
  BRAND,
  Footnote,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  DUR,
  EASE,
  MORPH,
  Pulse,
  SHARED,
  Spotlight,
  cueTransition,
} from "../../_components/motion";
import { Fri2Chip } from "../_parts/Fri2Chip";

const TYPE = 1;
const GUARD = 2;

/** Seconds per typed character, and when the flag lands after the last one. */
const CHAR = 0.028;
const TYPE_START = 0.45;

const FORM_W = 640;
const W = 1088;
const H = 380;

interface Field {
  label: string;
  /** Placeholder text only. The flagged line is invented and identifies no one. */
  text: string;
  score: number;
}

/**
 * Three free-text fields from the referral form. Two are already filled and
 * checked; the broker types the middle one live.
 */
const FIELDS: readonly Field[] = [
  {
    label: "Summary of care needs",
    text: "Needs two carers for transfers, and help with meals.",
    score: 4,
  },
  {
    label: "Additional care",
    text: "Call J. Example on 07700 900000 before the visit.",
    score: 94,
  },
  {
    label: "Cultural, religious and language notes",
    text: "Prefers a Punjabi-speaking carer.",
    score: 2,
  },
];

const TYPED = 1;
const LINE = 50;

const typedText = FIELDS[TYPED]?.text ?? "";
/** The flag lands just after the last character. */
const FLAG_AT = TYPE_START + typedText.length * CHAR + 0.25;

interface Guard {
  icon: Icon;
  label: string;
}

const GUARDS: readonly Guard[] = [
  { icon: IconSend, label: "A warning only: it never blocks posting" },
  { icon: IconLock, label: "Zero data retention requested" },
  { icon: IconRulerMeasure, label: "Pattern rules still run if Jev is down" },
];

const SHOTS: readonly CameraShot[] = [
  { rotateX: 6, rotateY: 5, translateZ: -30 },
  { rotateY: 2, translateZ: 18, y: -6 },
  { translateZ: -24 },
];

const GLOW = [
  { x: FORM_W / 2, y: H / 2, size: 560 },
  { x: FORM_W / 2, y: 180, size: 520 },
  { x: FORM_W + 220, y: H / 2, size: 620 },
];

/** A blinking caret: at the start while empty, at the end once typed. */
function Caret({ shown, delay }: { shown: boolean; delay: number }) {
  return (
    <m.span
      aria-hidden
      className="inline-block h-4 w-px translate-y-[3px] bg-foreground"
      initial={false}
      animate={{ opacity: shown ? [1, 1, 0, 0] : 0 }}
      transition={
        shown
          ? {
              duration: 1,
              repeat: Infinity,
              times: [0, 0.5, 0.5, 1],
              delay,
            }
          : { duration: 0 }
      }
    />
  );
}

/**
 * The broker's typing, one character at a time. Untyped characters are
 * invisible but keep their width, so there is no caret while typing.
 */
function TypedText({ typing }: { typing: boolean }) {
  return (
    <span>
      {typing ? null : <Caret shown delay={0} />}
      {typedText.split("").map((char, index) => (
        <m.span
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: typing ? 1 : 0 }}
          transition={{
            duration: 0.01,
            delay: typing ? TYPE_START + index * CHAR : 0,
          }}
        >
          {char}
        </m.span>
      ))}
      {typing ? <Caret shown delay={FLAG_AT - 0.25} /> : null}
    </span>
  );
}

function FieldRow({ field, index }: { field: Field; index: number }) {
  const step = useDeckStep();
  const live = index === TYPED;
  const typing = step >= TYPE;
  // The filled fields were checked before the slide; the typed one is
  // checked the moment typing stops.
  const scored = live ? typing : true;
  const flagged = live && typing;
  const at = live && step === TYPE ? FLAG_AT : 0.6 + index * 0.2;
  const above = field.score >= LINE;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>{field.label}</span>
        <m.span
          className={cn(
            "rounded-full px-2 py-0.5 font-medium tabular-nums",
            above
              ? "bg-status-progress-bg text-status-progress"
              : "bg-muted text-muted-foreground",
          )}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={
            scored ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }
          }
          transition={cueTransition(scored, at, {
            type: "spring",
            bounce: 0.35,
            duration: 0.45,
          })}
        >
          {field.score}%
        </m.span>
      </div>
      <m.div
        className="h-[42px] rounded-lg border bg-card px-3 py-2.5 text-sm text-foreground"
        initial={false}
        animate={{
          borderColor: flagged
            ? "rgb(245,158,11)"
            : live
              ? "rgba(255,255,255,0.28)"
              : "rgba(255,255,255,0.1)",
          boxShadow: flagged
            ? "0 0 0 3px rgba(245,158,11,0.25)"
            : "0 0 0 0 rgba(245,158,11,0)",
        }}
        transition={cueTransition(flagged, flagged ? FLAG_AT : 0, {
          duration: DUR.base,
          ease: EASE.out,
        })}
      >
        {live ? <TypedText typing={typing} /> : field.text}
      </m.div>
      {live ? (
        <m.div
          className="flex items-center gap-1.5 overflow-hidden text-xs text-amber-600 dark:text-amber-400"
          initial={{ opacity: 0, height: 0 }}
          animate={
            flagged ? { opacity: 1, height: 22 } : { opacity: 0, height: 0 }
          }
          transition={cueTransition(flagged, FLAG_AT + 0.1, {
            duration: DUR.slow,
            ease: EASE.expo,
          })}
        >
          <IconAlertTriangle size={13} />
          May contain personal details
        </m.div>
      ) : null}
    </div>
  );
}

function ReferralForm() {
  const appScheme = useAppScheme();
  const step = useDeckStep();
  const flagged = step >= TYPE;
  const at = step === TYPE ? FLAG_AT + 0.2 : 0;

  return (
    <div
      className={cn(
        appScheme,
        "absolute top-0 left-0 overflow-hidden rounded-2xl bg-background ring-1 ring-white/10",
      )}
      style={{ width: FORM_W }}
    >
      <div className="flex h-11 items-center gap-3 border-b border-border/60 px-4">
        <span className="text-sm font-medium text-foreground">
          Post a referral
        </span>
        <span className="text-xs text-muted-foreground">Step 2 of 4</span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-2xs text-muted-foreground">
          CarePulse
        </span>
        <m.span
          className="ml-auto flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400"
          initial={{ opacity: 0, x: 8 }}
          animate={flagged ? { opacity: 1, x: 0 } : { opacity: 0, x: 8 }}
          transition={cueTransition(flagged, at, {
            duration: DUR.base,
            ease: EASE.out,
          })}
        >
          <IconAlertTriangle size={14} />
          Care needs
        </m.span>
      </div>
      <div className="flex flex-col gap-3.5 p-5">
        {FIELDS.map((field, index) => (
          <FieldRow key={field.label} field={field} index={index} />
        ))}
      </div>
    </div>
  );
}

/** The one question asked of every field, beside the form. */
function Question() {
  const step = useDeckStep();
  const asked = step >= TYPE;
  const guarded = step >= GUARD;

  return (
    <div
      className="absolute top-0 flex flex-col gap-4"
      style={{ left: FORM_W + 40, width: W - FORM_W - 40 }}
    >
      {/* Jev's tile from the slide before grows into this card. */}
      <m.div
        layoutId={SHARED.jev}
        className="rounded-[22px] p-5 ring-1 ring-white/10 ring-inset"
        style={{
          background: `linear-gradient(145deg, ${BRAND.purple}30, ${BRAND.blue}22)`,
        }}
        initial={false}
        animate={{ opacity: guarded ? 0.5 : asked ? 1 : 0.7 }}
        transition={{ duration: DUR.slow, ease: EASE.out, layout: MORPH }}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-white/70">
          <Pulse color={BRAND.blue} size={7} step={TYPE} delay={0.2} />
          PID checker, run by Jev
        </div>
        <div className="mt-3 text-xl leading-snug font-semibold text-balance text-white">
          “Could this text identify a specific person?”
        </div>
        <div className="mt-3 text-sm text-white/50">
          Flags the field the moment you stop typing.
        </div>
      </m.div>

      <div className="flex flex-col gap-2">
        {GUARDS.map((guard, index) => (
          <Fri2Chip
            key={guard.label}
            icon={guard.icon}
            label={guard.label}
            lit={guarded}
            index={index}
            delay={0.3 + index * 0.12}
          />
        ))}
      </div>
    </div>
  );
}

export function FridayJevCarePulse() {
  return (
    <Shell className="py-14">
      <Title size="md">
        PID, <Accent>flagged</Accent> as you type.
      </Title>

      <Camera shots={SHOTS} className="mt-8">
        <div className="relative isolate" style={{ width: W, height: H }}>
          <Spotlight shots={GLOW} className="-inset-16 overflow-visible" />
          <ReferralForm />
          <Question />
        </div>
      </Camera>

      <Footnote>
        AQP referral form, carepulse-ts, on main since 14 October 2026. The
        field text is invented and identifies no one; the scores are an
        illustration.
      </Footnote>
    </Shell>
  );
}

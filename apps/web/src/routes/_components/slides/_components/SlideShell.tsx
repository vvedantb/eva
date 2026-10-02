import { createContext, use } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { motionBase } from "@eva/ui";

/**
 * The current build step for the active slide. 0 = initial state (no clicks
 * yet). Provided by SlideDeck; defaults to 0 so slides are usable standalone.
 */
export const SlideStepContext = createContext<number>(0);

/** Active slide theme — set by SlideDeck so children can apply theme-aware styling. */
export const SlideThemeContext = createContext<"dark" | "light">("light");

const fadeUpVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

interface SlideRevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  step?: number;
}

export function SlideReveal({
  children,
  delay = 0,
  step = 0,
  className = "",
}: SlideRevealProps) {
  const contextStep = use(SlideStepContext);
  const isVisible = contextStep >= step;
  return (
    <motion.div
      initial="hidden"
      animate={isVisible ? "show" : "hidden"}
      variants={fadeUpVariants}
      transition={{
        duration: motionBase.duration as number,
        ease: motionBase.ease,
        delay: isVisible ? delay : 0,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface SlideStaggerProps {
  children: ReactNode;
  className?: string;
  delayChildren?: number;
  staggerChildren?: number;
  step?: number;
}

export function SlideStagger({
  children,
  className = "",
  delayChildren = 0.1,
  staggerChildren = 0.07,
  step = 0,
}: SlideStaggerProps) {
  const contextStep = use(SlideStepContext);
  const isVisible = contextStep >= step;
  return (
    <motion.div
      initial="hidden"
      animate={isVisible ? "show" : "hidden"}
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren,
            delayChildren,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface SlideItemProps {
  children: ReactNode;
  className?: string;
}

export function SlideItem({ children, className = "" }: SlideItemProps) {
  return (
    <motion.div
      variants={fadeUpVariants}
      transition={{ duration: motionBase.duration as number, ease: motionBase.ease }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface SlideShellProps {
  children: ReactNode;
  className?: string;
  center?: boolean;
}

export function SlideShell({
  children,
  className = "",
  center = false,
}: SlideShellProps) {
  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden px-20 py-16 ${center ? "items-center justify-center" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

interface SlideKickerProps {
  children: ReactNode;
}

export function SlideKicker({ children }: SlideKickerProps) {
  return (
    <p className="mb-4 text-xs font-medium uppercase tracking-[0.22em] text-foreground/60">
      {children}
    </p>
  );
}

interface SlideTitleProps {
  children: ReactNode;
  size?: "xl" | "2xl" | "3xl";
}

export function SlideTitle({ children, size = "2xl" }: SlideTitleProps) {
  const sizeClass =
    size === "xl" ? "text-5xl" : size === "2xl" ? "text-6xl" : "text-7xl";
  return (
    <h1
      className={`font-sans ${sizeClass} font-semibold leading-tight tracking-tight text-foreground`}
    >
      {children}
    </h1>
  );
}

interface SlideBodyProps {
  children: ReactNode;
  className?: string;
}

export function SlideBody({ children, className = "" }: SlideBodyProps) {
  return (
    <p className={`text-lg leading-relaxed text-foreground/70 ${className}`}>
      {children}
    </p>
  );
}

interface SlideBulletsProps {
  items: string[];
}

export function SlideBullets({ items }: SlideBulletsProps) {
  return (
    <ul className="mt-6 space-y-4">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
          <span className="text-base leading-relaxed text-foreground/80">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface SlideDividerProps {
  className?: string;
}

export function SlideDivider({ className = "" }: SlideDividerProps) {
  return <div className={`mt-8 ${className}`} />;
}

interface SlideTagProps {
  children: ReactNode;
}

export function SlideTag({ children }: SlideTagProps) {
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
      {children}
    </span>
  );
}

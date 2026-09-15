import { use } from "react";
import { motion } from "motion/react";
import { SlideStepContext } from "../_components/SlideShell";

const wordVariants = {
  hidden: { opacity: 0, y: 8, filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
};

export function Slide11Insight() {
  const step = use(SlideStepContext);
  return (
    <div className="relative flex h-full w-full flex-col items-start justify-center bg-zinc-950 px-20 py-16">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="mb-4 text-xs font-medium uppercase tracking-[0.22em] text-zinc-500"
      >
        Why Eva?
      </motion.p>

      <motion.h1
        className="font-sans text-6xl font-semibold leading-tight tracking-tight text-zinc-50"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: {
              staggerChildren: 0.2,
              delayChildren: 0.15,
            },
          },
        }}
      >
        {["Code", "is", "cheap."].map((word, i) => (
          <motion.span
            key={i}
            variants={wordVariants}
            className="inline-block"
            style={{ marginRight: "0.22em" }}
          >
            {word}
          </motion.span>
        ))}
        <br />
        {["Context", "is", "expensive."].map((word, i) => (
          <motion.span
            key={i + 3}
            variants={wordVariants}
            className="inline-block"
            style={{ marginRight: "0.22em" }}
          >
            {word}
          </motion.span>
        ))}
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={step >= 1 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-10 max-w-2xl text-lg leading-relaxed text-zinc-400"
      >
        Eva preserves your context across tasks, sessions, and projects — so
        you spend less time re-explaining and more time shipping.
      </motion.p>
    </div>
  );
}

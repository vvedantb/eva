import { use } from "react";
import { motion } from "motion/react";
import { SlideStepContext } from "../_components/SlideShell";

export function Slide01Title() {
  const step = use(SlideStepContext);
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center bg-zinc-950 px-20 py-16">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="text-center"
      >
        <span className="font-sans text-8xl font-semibold tracking-tight text-zinc-50">
          Eva
        </span>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={step >= 1 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-8 text-center font-sans text-2xl font-normal text-zinc-400"
      >
        An open-source AI dev platform
      </motion.p>
    </div>
  );
}

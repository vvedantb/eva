import { motion } from "motion/react";

export function Slide12Demo() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center bg-zinc-950 px-20 py-16">
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="font-sans text-7xl font-semibold tracking-tight text-zinc-50"
      >
        Demo
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-6 text-xl text-zinc-400"
      >
        Let's see it in action.
      </motion.p>
    </div>
  );
}

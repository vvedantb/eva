import { motion } from "motion/react";

export function Slide13Closing() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center bg-zinc-950 px-20 py-16">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="text-center"
      >
        <span className="font-sans text-7xl font-semibold tracking-tight text-zinc-50">
          Eva
        </span>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-8 text-center font-sans text-xl font-normal text-zinc-400"
      >
        Open source · MIT licensed
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mt-4 font-mono text-sm text-zinc-500"
      >
        github.com/vvedantb/eva
      </motion.p>
    </div>
  );
}

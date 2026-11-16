import type { ReactNode } from "react";
import { IconPackages } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Card,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { DUR, EASE } from "../../_components/motion";
import { BeeLogo } from "../bee/_parts/BeeLogo";

/** Redline's own mark, from its landing page favicon. */
function RedlineMark() {
  return (
    <svg viewBox="0 0 14 14" fill="none" className="size-7" aria-hidden>
      <rect
        x="1"
        y="1"
        width="12"
        height="12"
        rx="2"
        stroke="#e11d48"
        strokeWidth="2"
      />
      <rect x="4.5" y="4.5" width="5" height="5" rx="1" fill="#e11d48" />
    </svg>
  );
}

/** flowtape's own mark: the filled circle from its wordmark. */
function FlowtapeMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-6" aria-hidden>
      <circle cx="8" cy="8" r="8" fill="#fcfcfc" />
    </svg>
  );
}

interface Project {
  mark: ReactNode;
  name: string;
  what: string;
  detail: string;
}

/** One card per build step, left to right then down. Sources in the notes. */
const PROJECTS: readonly Project[] = [
  {
    mark: <BeeLogo size={36} tone="dark" glow={false} />,
    name: "Bee",
    what: "Finds what you already know, during a meeting",
    detail: "Desktop app for Windows and Mac",
  },
  {
    mark: <RedlineMark />,
    name: "Redline",
    what: "Shows what a change did to every page",
    detail: "Before and after screenshots, with the likely cause",
  },
  {
    mark: <FlowtapeMark />,
    name: "flowtape",
    what: "Turns a clicked-through journey into an agent test",
    detail: "Personal details hidden before anything is saved",
  },
  {
    mark: <IconPackages size={28} stroke={1.6} className="text-white/80" />,
    name: "Shared packages",
    what: "One set of components for every app",
    detail: "Eva now runs on it",
  },
];

function ProjectCard({ project, index }: { project: Project; index: number }) {
  const shown = useDeckStep() >= index + 1;
  return (
    <m.div
      initial={{ opacity: 0.25, y: 12 }}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0.25, y: 12 }}
      transition={{ duration: DUR.slow, ease: EASE.expo }}
    >
      {/* p-7 inside a 28px outer radius keeps the corners concentric. */}
      <Card className="flex h-[188px] flex-col rounded-[28px] p-7">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center">
            {project.mark}
          </span>
          <span className="text-2xl font-semibold text-white">
            {project.name}
          </span>
        </div>
        <div className="mt-auto text-xl leading-snug text-white/85">
          {project.what}
        </div>
        <div className="mt-2 text-base text-white/45">{project.detail}</div>
      </Card>
    </m.div>
  );
}

export function AnnualBeyond() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">Beyond Eva</Title>
      </Reveal>

      <div className="mt-10 grid grid-cols-2 gap-5">
        {PROJECTS.map((project, index) => (
          <ProjectCard key={project.name} project={project} index={index} />
        ))}
      </div>
    </Shell>
  );
}

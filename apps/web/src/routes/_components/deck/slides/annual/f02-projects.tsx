import type { ReactNode } from "react";
import {
  Accent,
  Card,
  Reveal,
  Shell,
  Title,
} from "../../_components/DeckPrimitives";

const LABEL = "text-sm font-semibold tracking-[0.14em] text-white/45 uppercase";

interface Recap {
  title: ReactNode;
  built: readonly string[];
  changed: readonly string[];
}

function ProjectRecap({ recap }: { recap: Recap }) {
  const columns = [
    { label: "What I built", items: recap.built },
    { label: "What it changed", items: recap.changed },
  ];
  return (
    <Shell className="py-12">
      <Reveal>
        <Title size="md">{recap.title}</Title>
      </Reveal>

      <div className="mt-12 grid grid-cols-2 gap-5">
        {columns.map((column, index) => (
          <Reveal key={column.label} step={index + 1}>
            <Card className="flex h-[300px] flex-col gap-6 rounded-[28px] p-8">
              <div className={LABEL}>{column.label}</div>
              <ul className="flex flex-col gap-4">
                {column.items.map((item) => (
                  <li
                    key={item}
                    className="text-2xl leading-snug text-white/85"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>
        ))}
      </div>
    </Shell>
  );
}

export function ProjectVmem() {
  return (
    <ProjectRecap
      recap={{
        title: (
          <>
            One <Accent>memory</Accent> for every AI
          </>
        ),
        built: [
          "Saves chats, files and notes once, in one place",
          "Links people and projects into a graph",
          "Any AI tool can read it, over MCP",
        ],
        changed: [
          "Live and hosted, with a Chrome extension",
          "Jev ranks what it recalls",
          "Final-year degree project: 80%, alongside full-time work",
        ],
      }}
    />
  );
}

export function ProjectFlowtape() {
  return (
    <ProjectRecap
      recap={{
        title: (
          <>
            Click through once, get a <Accent>test</Accent>
          </>
        ),
        built: [
          "Records a journey through an app",
          "Turns it into a prompt an agent can replay",
          "Hides passwords and NHS numbers before saving",
        ],
        changed: [
          "Tests come from clicking, not writing code",
          "Published on npm",
        ],
      }}
    />
  );
}

export function ProjectRedline() {
  return (
    <ProjectRecap
      recap={{
        title: (
          <>
            See what a change did to <Accent>every page</Accent>
          </>
        ),
        built: [
          "Builds the app before and after a change",
          "Screenshots every page at both",
          "Points to the files most likely responsible",
        ],
        changed: [
          "Visual checks by a tool, not by eye",
          "Used in Eva's own development",
          "Published on npm",
        ],
      }}
    />
  );
}

export function ProjectBee() {
  return (
    <ProjectRecap
      recap={{
        title: (
          <>
            Answers <Accent>during</Accent> the meeting
          </>
        ),
        built: [
          "A desktop app for Windows and Mac",
          "Listens in a meeting",
          "Finds your own notes and short answers",
        ],
        changed: [
          "Presented to the company in November",
          "Still in progress, open to testers",
        ],
      }}
    />
  );
}

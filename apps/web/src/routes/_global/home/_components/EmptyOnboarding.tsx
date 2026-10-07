import { m } from "motion/react";
import { Button, Card, CardContent, motionBase } from "@eva/ui";
import { IconBrandGithub } from "@tabler/icons-react";
import { PLATFORM_SECTIONS } from "@/lib/content/platformSections";

export function EmptyOnboarding({ connectUrl }: { connectUrl: string }) {
  const steps = [
    { num: 1, label: "Connect GitHub", active: true },
    { num: 2, label: "Select a repo", active: false },
    { num: 3, label: "Start building", active: false },
  ];

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionBase}
      className="flex flex-col items-center px-4 py-12"
    >
      <div className="mb-12 flex flex-wrap items-center justify-center gap-2">
        {steps.map((step, i) => (
          <div key={step.num} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-[background-color,color,box-shadow] ${
                step.active
                  ? "bg-primary text-background ring-2 ring-primary/25 ring-offset-1 ring-offset-background"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {step.num}
            </div>
            <span
              className={`whitespace-nowrap text-xs ${
                step.active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={`mx-1 hidden h-px w-8 shrink-0 sm:block ${
                  i === 0
                    ? "bg-linear-to-r from-primary/40 to-border"
                    : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mb-10 flex max-w-sm flex-col items-center text-center">
        <div className="relative mb-6 flex items-center justify-center">
          <div className="absolute h-32 w-32 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute h-20 w-20 rounded-full bg-primary/10 blur-xl" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-surface border border-border bg-muted/40 ring-1 ring-primary/15">
            <IconBrandGithub size={26} className="text-primary" />
          </div>
        </div>
        <h2 className="mb-2 text-xl font-semibold tracking-tight text-foreground text-balance">
          Connect your GitHub
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          Link your codebases to unlock Eva's AI tools for planning, coding, and
          shipping features autonomously.
        </p>
        <Button
          asChild
          className="bg-foreground px-6 font-medium text-background active:scale-[0.96]"
        >
          <a href={connectUrl}>
            <IconBrandGithub size={16} />
            Connect GitHub
          </a>
        </Button>
      </div>

      <div className="w-full max-w-lg">
        <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          What you&apos;ll get access to
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLATFORM_SECTIONS.map((section, index) => (
            <m.div
              key={section.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...motionBase, delay: 0.15 + index * 0.06 }}
            >
              <Card className="ui-surface-strong h-full overflow-hidden">
                <div className="h-px bg-linear-to-r from-primary/50 via-primary/20 to-transparent" />
                <CardContent className="p-3">
                  <section.icon size={16} className="mb-2 text-primary" />
                  <p className="text-xs font-medium text-foreground">
                    {section.label}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {section.longDesc}
                  </p>
                </CardContent>
              </Card>
            </m.div>
          ))}
        </div>
      </div>
    </m.div>
  );
}

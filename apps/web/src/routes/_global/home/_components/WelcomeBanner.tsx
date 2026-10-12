import { m } from "motion/react";
import { Button, Card, CardContent, motionBase } from "@eva/ui";
import { IconX, IconSparkles } from "@tabler/icons-react";
import { PLATFORM_SECTIONS } from "@/lib/content/platformSections";

export function WelcomeBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={motionBase}
    >
      <Card className="ui-surface-strong mb-6 overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="relative">
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                  <IconSparkles size={14} className="text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  Getting started with Eva
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={onDismiss}
                aria-label="Dismiss getting started"
                className="-mr-1 h-7 w-7 text-muted-foreground hover:text-foreground relative after:absolute after:inset-[-6px]"
              >
                <IconX size={14} />
              </Button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Select a repository below to access Eva's tools for planning,
              coding, and shipping.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PLATFORM_SECTIONS.map((section) => (
                <div
                  key={section.label}
                  className="rounded-surface flex flex-col gap-1.5 border border-border bg-card p-2.5"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                    <section.icon size={13} className="text-primary" />
                  </div>
                  <p className="text-xs font-medium text-foreground">
                    {section.label}
                  </p>
                  <p className="text-2xs leading-relaxed text-muted-foreground">
                    {section.shortDesc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </m.div>
  );
}

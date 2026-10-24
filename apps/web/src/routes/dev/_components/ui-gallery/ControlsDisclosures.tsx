import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Calendar,
  Carousel,
  CarouselContent,
  CarouselDots,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Surface,
  Tabs,
  TabsBar,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@vvedantb/ui";
import { IconChevronDown, IconSettings } from "@tabler/icons-react";
import { GalleryGroup, GalleryItem } from "./GalleryItem";

/** Fixed dates so the calendar never shows the real month or today. */
const CALENDAR_MONTH = new Date(2025, 2, 1);
const CALENDAR_TODAY = new Date(2025, 2, 3);
const CALENDAR_SELECTED = new Date(2025, 2, 14);

const SLIDES = ["One", "Two", "Three", "Four", "Five"];

function TabsSpecimen({ size }: { size: "default" | "sm" }) {
  return (
    <Tabs defaultValue="overview">
      <TabsList size={size}>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="disabled" disabled>
          Disabled
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <span className="text-sm">Overview content</span>
      </TabsContent>
    </Tabs>
  );
}

export function DisclosureGroups() {
  return (
    <>
      <GalleryGroup title="Calendar / Carousel">
        <GalleryItem label="Calendar March 2025, 14 selected, today=3">
          <Calendar
            mode="single"
            defaultMonth={CALENDAR_MONTH}
            today={CALENDAR_TODAY}
            selected={CALENDAR_SELECTED}
          />
        </GalleryItem>
        <GalleryItem label="Calendar range" className="w-fit">
          <Calendar
            mode="range"
            defaultMonth={CALENDAR_MONTH}
            today={CALENDAR_TODAY}
            selected={{
              from: new Date(2025, 2, 10),
              to: new Date(2025, 2, 16),
            }}
          />
        </GalleryItem>
        <GalleryItem label="Carousel (first slide)" className="w-96 px-12">
          <Carousel>
            <CarouselContent>
              {SLIDES.map((slide) => (
                <CarouselItem key={slide} className="basis-1/2">
                  <Surface className="flex h-24 items-center justify-center text-2xl font-semibold">
                    {slide}
                  </Surface>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
            <CarouselDots />
          </Carousel>
        </GalleryItem>
      </GalleryGroup>
      <GalleryGroup title="Tabs">
        <GalleryItem label="TabsList default">
          <TabsSpecimen size="default" />
        </GalleryItem>
        <GalleryItem label="TabsList sm">
          <TabsSpecimen size="sm" />
        </GalleryItem>
        <GalleryItem label="Tabs vertical">
          <Tabs defaultValue="b" orientation="vertical" className="flex gap-4">
            <TabsList className="h-auto flex-col items-stretch">
              <TabsTrigger value="a">General</TabsTrigger>
              <TabsTrigger value="b">Members</TabsTrigger>
              <TabsTrigger value="c">Billing</TabsTrigger>
            </TabsList>
            <TabsContent value="b" className="mt-0">
              <span className="text-sm">Members content</span>
            </TabsContent>
          </Tabs>
        </GalleryItem>
        <GalleryItem
          label="TabsBar default + actions / sm"
          className="w-[560px]"
        >
          <Surface
            density="none"
            className="flex flex-col gap-3 overflow-hidden"
          >
            <Tabs defaultValue="diff">
              <TabsBar
                actions={
                  <Button size="sm" variant="ghost">
                    <IconSettings />
                    Options
                  </Button>
                }
              >
                <TabsList>
                  <TabsTrigger value="diff">Diff</TabsTrigger>
                  <TabsTrigger value="files">Files</TabsTrigger>
                </TabsList>
              </TabsBar>
            </Tabs>
            <Tabs defaultValue="logs">
              <TabsBar size="sm">
                <TabsList size="sm">
                  <TabsTrigger value="logs">Logs</TabsTrigger>
                  <TabsTrigger value="env">Env</TabsTrigger>
                </TabsList>
              </TabsBar>
            </Tabs>
          </Surface>
        </GalleryItem>
      </GalleryGroup>
      <GalleryGroup title="Accordion / Collapsible">
        <GalleryItem label="Accordion (second open)" className="w-96">
          <Accordion type="single" defaultValue="b" collapsible>
            <AccordionItem value="a">
              <AccordionTrigger>What is eva?</AccordionTrigger>
              <AccordionContent>
                A platform for running codebases.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="b">
              <AccordionTrigger>Where do sandboxes run?</AccordionTrigger>
              <AccordionContent>
                Sandboxes run on Vercel and use IPv4 only.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="c">
              <AccordionTrigger>Can I bring my own repo?</AccordionTrigger>
              <AccordionContent>Yes.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </GalleryItem>
        <GalleryItem label="Collapsible open / closed" className="w-80">
          <div className="flex flex-col gap-3">
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium">
                Open section
                <IconChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="pt-2 text-sm text-muted-foreground">
                  This panel starts open.
                </p>
              </CollapsibleContent>
            </Collapsible>
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium">
                Closed section
                <IconChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="pt-2 text-sm text-muted-foreground">Hidden.</p>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </GalleryItem>
      </GalleryGroup>
    </>
  );
}

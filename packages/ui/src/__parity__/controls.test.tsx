// @vitest-environment happy-dom
// Parity for the controls family: each legacy @eva/ui control against its
// @vvedantb/ui replacement under `evaUiConfig`. `controls.sites.json` holds
// the static variant / size / className combinations found at eva call sites
// (apps/web and packages/ui, literals inside `cn(...)` joined as if every
// condition held).
import type { ReactNode } from "react";
import { describe, expect, test } from "vitest";
import * as Next from "@vvedantb/ui";
import { evaUiConfig } from "../config";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../__legacy__/ui/accordion";
import { Badge } from "../__legacy__/ui/badge";
import { Button } from "../__legacy__/ui/button";
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "../__legacy__/ui/button-group";
import { Calendar } from "../__legacy__/ui/calendar";
import { Carousel, CarouselContent, CarouselDots, CarouselItem } from "../__legacy__/ui/carousel";
import { Checkbox } from "../__legacy__/ui/checkbox";
import { ClearInput } from "../__legacy__/ui/clear-input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../__legacy__/ui/collapsible";
import { Input } from "../__legacy__/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "../__legacy__/ui/input-group";
import { SearchInput } from "../__legacy__/ui/search-input";
import { Slider } from "../__legacy__/ui/slider";
import { Switch } from "../__legacy__/ui/switch";
import { Tabs, TabsBar, TabsContent, TabsList, TabsTrigger } from "../__legacy__/ui/tabs";
import { Textarea } from "../__legacy__/ui/textarea";
import sites from "./controls.sites.json";
import { renderPair } from "./harness";

const BUTTON_VARIANTS = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const;
const BUTTON_SIZES = ["default", "xs", "sm", "lg", "icon", "icon-sm", "icon-xs"] as const;
const BADGE_VARIANTS = ["default", "secondary", "destructive", "outline", "success", "warning"] as const;
const ADDON_ALIGNS = ["inline-start", "inline-end", "block-start", "block-end"] as const;
const GROUP_BUTTON_SIZES = ["xs", "sm", "icon-xs", "icon-sm"] as const;

/** The value when it is one of `allowed`, else `undefined` (call-site JSON is untyped). */
function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.find((a) => a === value);
}

/**
 * Attributes vvedantb adds that eva neither renders nor targets (no eva CSS,
 * test or script selects these `data-slot` values or `data-variant`), so
 * dropping them before the comparison hides no visible or behavioural change.
 */
const INVISIBLE_ATTRS =
  / data-slot="(?:calendar|carousel|carousel-content|carousel-item|carousel-dots|accordion|accordion-item|accordion-trigger|accordion-content)"| data-variant="segmented"/g;

async function expectSame(legacy: ReactNode, next: ReactNode, interact?: () => Promise<void> | void) {
  const pair = await renderPair(legacy, next, evaUiConfig, interact);
  expect(pair.next.replace(INVISIBLE_ATTRS, "")).toBe(pair.legacy);
}

describe("Button", () => {
  test.each(BUTTON_VARIANTS.flatMap((variant) => BUTTON_SIZES.map((size) => [variant, size] as const)))(
    "variant=%s size=%s",
    async (variant, size) => {
      await expectSame(
        <Button variant={variant} size={size}>Go</Button>,
        <Next.Button variant={variant} size={size}>Go</Next.Button>,
      );
    },
  );

  test("no props, disabled, asChild, svg child", async () => {
    await expectSame(
      <>
        <Button>Go</Button>
        <Button disabled type="submit">Go</Button>
        <Button asChild variant="outline"><a href="/x">Link</a></Button>
        <Button size="icon-xs" aria-label="Close"><svg /></Button>
      </>,
      <>
        <Next.Button>Go</Next.Button>
        <Next.Button disabled type="submit">Go</Next.Button>
        <Next.Button asChild variant="outline"><a href="/x">Link</a></Next.Button>
        <Next.Button size="icon-xs" aria-label="Close"><svg /></Next.Button>
      </>,
    );
  });

  test.each(sites.Button.map((site) => [JSON.stringify(site), site] as const))("call site %s", async (_, site) => {
    const variant = pick(site.variant, BUTTON_VARIANTS);
    const size = pick(site.size, BUTTON_SIZES);
    await expectSame(
      <Button variant={variant} size={size} className={site.className}>Go</Button>,
      <Next.Button variant={variant} size={size} className={site.className}>Go</Next.Button>,
    );
  });
});

describe("Badge", () => {
  test.each(BADGE_VARIANTS)("variant=%s", async (variant) => {
    await expectSame(<Badge variant={variant}>New</Badge>, <Next.Badge variant={variant}>New</Next.Badge>);
  });

  test.each(sites.Badge.map((site) => [JSON.stringify(site), site] as const))("call site %s", async (_, site) => {
    const variant = pick(site.variant, BADGE_VARIANTS);
    await expectSame(
      <Badge variant={variant} className={site.className}>New</Badge>,
      <Next.Badge variant={variant} className={site.className}>New</Next.Badge>,
    );
  });
});

describe("Input and Textarea", () => {
  test.each(sites.Input.map((site) => [JSON.stringify(site), site] as const))("Input %s", async (_, site) => {
    await expectSame(
      <Input type={site.type} className={site.className} placeholder="Name" disabled aria-invalid />,
      <Next.Input type={site.type} className={site.className} placeholder="Name" disabled aria-invalid />,
    );
  });

  test.each(sites.Textarea.map((site) => [JSON.stringify(site), site] as const))("Textarea %s", async (_, site) => {
    await expectSame(
      <Textarea className={site.className} placeholder="Notes" rows={3} />,
      <Next.Textarea className={site.className} placeholder="Notes" rows={3} />,
    );
  });
});

describe("Checkbox and Switch", () => {
  test.each(sites.Checkbox.map((site) => [JSON.stringify(site), site] as const))("Checkbox %s", async (_, site) => {
    await expectSame(
      <>
        <Checkbox className={site.className} aria-label="a" />
        <Checkbox className={site.className} defaultChecked aria-label="b" />
        <Checkbox className={site.className} checked="indeterminate" disabled aria-label="c" />
      </>,
      <>
        <Next.Checkbox className={site.className} aria-label="a" />
        <Next.Checkbox className={site.className} defaultChecked aria-label="b" />
        <Next.Checkbox className={site.className} checked="indeterminate" disabled aria-label="c" />
      </>,
    );
  });

  test("Checkbox toggles on click", async () => {
    await expectSame(<Checkbox aria-label="a" />, <Next.Checkbox aria-label="a" />, () => {
      document.querySelector("button")?.click();
    });
  });

  test("Switch unchecked, checked, disabled, toggled", async () => {
    await expectSame(
      <>
        <Switch aria-label="a" />
        <Switch defaultChecked aria-label="b" aria-describedby="d" />
        <Switch disabled aria-label="c" />
      </>,
      <>
        <Next.Switch aria-label="a" />
        <Next.Switch defaultChecked aria-label="b" aria-describedby="d" />
        <Next.Switch disabled aria-label="c" />
      </>,
      () => {
        document.querySelector("button")?.click();
      },
    );
  });
});

describe("Slider", () => {
  // Exception: vvedantb puts `aria-label` / `aria-valuetext` on the thumb (the
  // focusable role="slider" element) where eva left them on the role-less root
  // span. Only the attribute's element moves; layout and classes are equal, and
  // screen readers now get the name eva meant to give. The labelled case moves
  // the attributes back before comparing; the unlabelled case is exact.
  test("as simple-model-ladder renders it, without labels", async () => {
    await expectSame(
      <Slider min={0} max={4} step={1} value={[2]} disabled={false} />,
      <Next.Slider min={0} max={4} step={1} value={[2]} disabled={false} />,
    );
  });

  test("labelled and disabled", async () => {
    const pair = await renderPair(
      <Slider min={0} max={4} step={1} value={[2]} disabled aria-label="Model" aria-valuetext="Fast" />,
      <Next.Slider min={0} max={4} step={1} value={[2]} disabled aria-label="Model" aria-valuetext="Fast" />,
      evaUiConfig,
    );
    const strip = (html: string) => html.replace(/ aria-label="Model"| aria-valuetext="Fast"/g, "");
    expect(pair.legacy).toContain('aria-label="Model"');
    expect(pair.next).toContain('aria-label="Model"');
    expect(strip(pair.next)).toBe(strip(pair.legacy));
  });
});

describe("ButtonGroup", () => {
  test.each(["horizontal", "vertical", undefined] as const)("orientation=%s", async (orientation) => {
    await expectSame(
      <ButtonGroup orientation={orientation}>
        <Button variant="outline">A</Button>
        <ButtonGroupText>B</ButtonGroupText>
        <Button variant="outline" size="icon-sm">C</Button>
      </ButtonGroup>,
      <Next.ButtonGroup orientation={orientation}>
        <Next.Button variant="outline">A</Next.Button>
        <Next.ButtonGroupText>B</Next.ButtonGroupText>
        <Next.Button variant="outline" size="icon-sm">C</Next.Button>
      </Next.ButtonGroup>,
    );
  });

  test("ButtonGroupText asChild", async () => {
    await expectSame(
      <ButtonGroupText asChild><span>B</span></ButtonGroupText>,
      <Next.ButtonGroupText asChild><span>B</span></Next.ButtonGroupText>,
    );
  });

  // ButtonGroupSeparator renders the foundations family's Separator, so its
  // full parity needs that family's config too; this checks the classes this
  // family adds on top (eva has no call site for it).
  test("ButtonGroupSeparator adds the same classes", async () => {
    const pair = await renderPair(<ButtonGroupSeparator />, <Next.ButtonGroupSeparator />, evaUiConfig);
    for (const token of ["bg-input", "relative", "m-0!", "self-stretch", "data-[orientation=vertical]:h-auto"]) {
      expect(pair.legacy).toContain(token);
      expect(pair.next).toContain(token);
    }
  });
});

describe("InputGroup", () => {
  test.each(ADDON_ALIGNS)("addon align=%s with text, input and buttons", async (align) => {
    await expectSame(
      <InputGroup>
        <InputGroupAddon align={align}><InputGroupText>@</InputGroupText></InputGroupAddon>
        <InputGroupInput placeholder="handle" aria-invalid />
        <InputGroupAddon align="inline-end">
          {GROUP_BUTTON_SIZES.map((size) => <InputGroupButton key={size} size={size}>Go</InputGroupButton>)}
          <InputGroupButton variant="default">Send</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>,
      <Next.InputGroup>
        <Next.InputGroupAddon align={align}><Next.InputGroupText>@</Next.InputGroupText></Next.InputGroupAddon>
        <Next.InputGroupInput placeholder="handle" aria-invalid />
        <Next.InputGroupAddon align="inline-end">
          {GROUP_BUTTON_SIZES.map((size) => <Next.InputGroupButton key={size} size={size}>Go</Next.InputGroupButton>)}
          <Next.InputGroupButton variant="default">Send</Next.InputGroupButton>
        </Next.InputGroupAddon>
      </Next.InputGroup>,
    );
  });

  test("as the prompt input renders it (textarea, block-end addon, call-site addons)", async () => {
    const [blockEnd, inlineEnd, inlineStart] = sites.InputGroupAddon;
    const end = pick(inlineEnd.align, ADDON_ALIGNS);
    const start = pick(inlineStart.align, ADDON_ALIGNS);
    await expectSame(
      <InputGroup className="overflow-hidden">
        <InputGroupTextarea className="field-sizing-content max-h-48 min-h-16" placeholder="Ask" />
        <InputGroupAddon align={pick(blockEnd.align, ADDON_ALIGNS)}>
          <InputGroupAddon align={start} className={inlineStart.className}>
            <InputGroupButton size="icon-sm" className="rounded-full">+</InputGroupButton>
          </InputGroupAddon>
          <InputGroupAddon align={end} className={inlineEnd.className}>
            <InputGroupButton type="submit" size="icon-sm" variant="default">Go</InputGroupButton>
          </InputGroupAddon>
        </InputGroupAddon>
      </InputGroup>,
      <Next.InputGroup className="overflow-hidden">
        <Next.InputGroupTextarea className="field-sizing-content max-h-48 min-h-16" placeholder="Ask" />
        <Next.InputGroupAddon align={pick(blockEnd.align, ADDON_ALIGNS)}>
          <Next.InputGroupAddon align={start} className={inlineStart.className}>
            <Next.InputGroupButton size="icon-sm" className="rounded-full">+</Next.InputGroupButton>
          </Next.InputGroupAddon>
          <Next.InputGroupAddon align={end} className={inlineEnd.className}>
            <Next.InputGroupButton type="submit" size="icon-sm" variant="default">Go</Next.InputGroupButton>
          </Next.InputGroupAddon>
        </Next.InputGroupAddon>
      </Next.InputGroup>,
    );
  });
});

describe("ClearInput and SearchInput", () => {
  test.each(["", "abc"])("ClearInput value=%j", async (value) => {
    const leading = <span className="absolute left-2">L</span>;
    await expectSame(
      <ClearInput value={value} onChange={() => {}} placeholder="Find" wrapperClassName="w-40" className="h-9" leading={leading} />,
      <Next.ClearInput value={value} onChange={() => {}} placeholder="Find" wrapperClassName="w-40" className="h-9" leading={leading} />,
    );
  });

  test.each(sites.SearchInput.flatMap((site) => ["", "abc"].map((value) => [JSON.stringify(site), value, site] as const)))(
    "SearchInput call site %s value=%j",
    async (_, value, site) => {
      await expectSame(
        <SearchInput value={value} onChange={() => {}} onClear={() => {}} className={site.className} inputClassName={site.inputClassName} />,
        <Next.SearchInput value={value} onChange={() => {}} onClear={() => {}} className={site.className} inputClassName={site.inputClassName} />,
      );
    },
  );

  test("SearchInput with placeholder and input props", async () => {
    await expectSame(
      <SearchInput value="x" onChange={() => {}} onClear={() => {}} placeholder="Filter files" autoFocus />,
      <Next.SearchInput value="x" onChange={() => {}} onClear={() => {}} placeholder="Filter files" autoFocus />,
    );
  });

  test("clearing calls onChange then onClear, and focuses the input", async () => {
    const calls: Record<"legacy" | "next", string[]> = { legacy: [], next: [] };
    const focused: string[] = [];
    const props = (log: string[]) => ({
      value: "abc",
      onChange: (next: string) => log.push(`change:${next}`),
      onClear: () => log.push("clear"),
    });
    await expectSame(<SearchInput {...props(calls.legacy)} />, <Next.SearchInput {...props(calls.next)} />, () => {
      document.querySelector<HTMLButtonElement>("button[aria-label]")?.click();
      focused.push(document.activeElement?.tagName ?? "none");
    });
    expect(calls.legacy).toEqual(["change:", "clear"]);
    expect(calls.next).toEqual(calls.legacy);
    expect(focused).toEqual(["INPUT", "INPUT"]);
  });
});

describe("Calendar", () => {
  const month = new Date(2026, 0, 1);
  const today = new Date(2026, 0, 10);
  // Exception: eva's day button spread react-day-picker's `day` object onto
  // the <button>, which React prints as `day="[object Object]"`. It is junk
  // (no CSS or code reads it); vvedantb's CalendarDayButton does not render it.
  const stripDay = (html: string) => html.replace(/ day="\[object Object\]"/g, "");

  test.each([
    ["single", { mode: "single", selected: new Date(2026, 0, 15) }],
    ["range", { mode: "range", selected: { from: new Date(2026, 0, 12), to: new Date(2026, 0, 16) } }],
  ] as const)("mode=%s", async (_, props) => {
    const disabled = { before: new Date(2026, 0, 5) };
    const pair = await renderPair(
      <Calendar {...props} month={month} today={today} disabled={disabled} className="rounded-lg" />,
      <Next.Calendar {...props} month={month} today={today} disabled={disabled} className="rounded-lg" />,
      evaUiConfig,
    );
    expect(pair.legacy).toContain('day="[object Object]"');
    expect(pair.next.replace(INVISIBLE_ATTRS, "")).toBe(stripDay(pair.legacy));
  });

  test("two months", async () => {
    const pair = await renderPair(
      <Calendar mode="single" month={month} today={today} numberOfMonths={2} />,
      <Next.Calendar mode="single" month={month} today={today} numberOfMonths={2} />,
      evaUiConfig,
    );
    expect(pair.next.replace(INVISIBLE_ATTRS, "")).toBe(stripDay(pair.legacy));
  });
});

describe("Carousel", () => {
  // Content, items and dots. CarouselPrevious / CarouselNext are not compared:
  // eva has no call site for them and their markup differs (see the report).
  test("content, items and dots", async () => {
    await expectSame(
      <Carousel className="w-64">
        <CarouselContent className="ml-0">
          <CarouselItem>A</CarouselItem>
          <CarouselItem className="basis-1/2">B</CarouselItem>
        </CarouselContent>
        <CarouselDots className="pt-3" />
      </Carousel>,
      <Next.Carousel className="w-64">
        <Next.CarouselContent className="ml-0">
          <Next.CarouselItem>A</Next.CarouselItem>
          <Next.CarouselItem className="basis-1/2">B</Next.CarouselItem>
        </Next.CarouselContent>
        <Next.CarouselDots className="pt-3" />
      </Next.Carousel>,
    );
  });
});

describe("Tabs", () => {
  const sizes = [undefined, "sm"] as const;

  test.each(sizes)("list size=%s with triggers and content", async (size) => {
    await expectSame(
      <Tabs defaultValue="a">
        <TabsList size={size} aria-label="Views">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
          <TabsTrigger value="c" disabled>C</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>,
      <Next.Tabs defaultValue="a">
        <Next.TabsList size={size} aria-label="Views">
          <Next.TabsTrigger value="a">A</Next.TabsTrigger>
          <Next.TabsTrigger value="b">B</Next.TabsTrigger>
          <Next.TabsTrigger value="c" disabled>C</Next.TabsTrigger>
        </Next.TabsList>
        <Next.TabsContent value="a">Panel A</Next.TabsContent>
        <Next.TabsContent value="b">Panel B</Next.TabsContent>
      </Next.Tabs>,
    );
  });

  test("switching tab moves the pill the same way", async () => {
    await expectSame(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
      </Tabs>,
      <Next.Tabs defaultValue="a">
        <Next.TabsList>
          <Next.TabsTrigger value="a">A</Next.TabsTrigger>
          <Next.TabsTrigger value="b">B</Next.TabsTrigger>
        </Next.TabsList>
      </Next.Tabs>,
      () => {
        const second = document.querySelectorAll<HTMLButtonElement>("[role=tab]")[1];
        second?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      },
    );
  });

  test.each(
    sites.TabsList.flatMap((list, i) => {
      const trigger = sites.TabsTrigger[i % sites.TabsTrigger.length];
      const content = sites.TabsContent[i % sites.TabsContent.length];
      return [[JSON.stringify(list), list, trigger, content] as const];
    }),
  )("call site list %s", async (_, list, trigger, content) => {
    const size = pick(list.size, sizes.filter((s) => s !== undefined));
    await expectSame(
      <Tabs defaultValue="a">
        <TabsList size={size} className={list.className}>
          <TabsTrigger value="a" className={trigger.className}>A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a" className={content.className}>A</TabsContent>
      </Tabs>,
      <Next.Tabs defaultValue="a">
        <Next.TabsList size={size} className={list.className}>
          <Next.TabsTrigger value="a" className={trigger.className}>A</Next.TabsTrigger>
          <Next.TabsTrigger value="b">B</Next.TabsTrigger>
        </Next.TabsList>
        <Next.TabsContent value="a" className={content.className}>A</Next.TabsContent>
      </Next.Tabs>,
    );
  });

  test.each(sites.TabsTrigger.map((site) => [JSON.stringify(site), site] as const))("call site trigger %s", async (_, site) => {
    await expectSame(
      <Tabs defaultValue="a"><TabsList><TabsTrigger value="a" className={site.className}>A</TabsTrigger></TabsList></Tabs>,
      <Next.Tabs defaultValue="a"><Next.TabsList><Next.TabsTrigger value="a" className={site.className}>A</Next.TabsTrigger></Next.TabsList></Next.Tabs>,
    );
  });

  test.each([...sites.TabsBar.map((site) => [JSON.stringify(site), site.className, undefined] as const), ["sm", undefined, "sm"] as const])(
    "TabsBar %s",
    async (_, className, size) => {
      const actions = <button type="button">Act</button>;
      await expectSame(
        <TabsBar className={className} size={size} actions={actions}>Tabs</TabsBar>,
        <Next.TabsBar className={className} size={size} actions={actions}>Tabs</Next.TabsBar>,
      );
      await expectSame(<TabsBar className={className}>Tabs</TabsBar>, <Next.TabsBar className={className}>Tabs</Next.TabsBar>);
    },
  );
});

describe("Accordion", () => {
  const cases = sites.AccordionItem.map((item, i) => ({
    item: item.className,
    trigger: sites.AccordionTrigger[i % sites.AccordionTrigger.length].className,
    content: sites.AccordionContent[i % sites.AccordionContent.length].className,
    root: sites.Accordion[i % sites.Accordion.length].className,
  }));

  test.each(cases.map((c) => [JSON.stringify(c), c] as const))("call site %s, one open one closed", async (_, c) => {
    await expectSame(
      <Accordion type="single" defaultValue="a" collapsible className={c.root}>
        <AccordionItem value="a" className={c.item}>
          <AccordionTrigger className={c.trigger}>Q1</AccordionTrigger>
          <AccordionContent className={c.content}>A1</AccordionContent>
        </AccordionItem>
        <AccordionItem value="b" className={c.item}>
          <AccordionTrigger className={c.trigger}>Q2</AccordionTrigger>
          <AccordionContent className={c.content}>A2</AccordionContent>
        </AccordionItem>
      </Accordion>,
      <Next.Accordion type="single" defaultValue="a" collapsible className={c.root}>
        <Next.AccordionItem value="a" className={c.item}>
          <Next.AccordionTrigger className={c.trigger}>Q1</Next.AccordionTrigger>
          <Next.AccordionContent className={c.content}>A1</Next.AccordionContent>
        </Next.AccordionItem>
        <Next.AccordionItem value="b" className={c.item}>
          <Next.AccordionTrigger className={c.trigger}>Q2</Next.AccordionTrigger>
          <Next.AccordionContent className={c.content}>A2</Next.AccordionContent>
        </Next.AccordionItem>
      </Next.Accordion>,
    );
  });

  test("multiple, toggled open by click", async () => {
    await expectSame(
      <Accordion type="multiple">
        <AccordionItem value="a"><AccordionTrigger>Q</AccordionTrigger><AccordionContent>A</AccordionContent></AccordionItem>
      </Accordion>,
      <Next.Accordion type="multiple">
        <Next.AccordionItem value="a"><Next.AccordionTrigger>Q</Next.AccordionTrigger><Next.AccordionContent>A</Next.AccordionContent></Next.AccordionItem>
      </Next.Accordion>,
      () => {
        document.querySelector("button")?.click();
      },
    );
  });
});

describe("Collapsible", () => {
  const triggers = sites.CollapsibleTrigger;
  const contents = sites.CollapsibleContent;

  test.each(triggers.map((t, i) => [JSON.stringify(t), t.className, contents[i % contents.length].className] as const))(
    "call site %s, closed then opened",
    async (_, trigger, content) => {
      for (const open of [false, true]) {
        await expectSame(
          <Collapsible defaultOpen={open} className="group">
            <CollapsibleTrigger className={trigger}>Toggle</CollapsibleTrigger>
            <CollapsibleContent className={content}>Body</CollapsibleContent>
          </Collapsible>,
          <Next.Collapsible defaultOpen={open} className="group">
            <Next.CollapsibleTrigger className={trigger}>Toggle</Next.CollapsibleTrigger>
            <Next.CollapsibleContent className={content}>Body</Next.CollapsibleContent>
          </Next.Collapsible>,
        );
      }
    },
  );

  test("asChild trigger and content, toggled by click", async () => {
    await expectSame(
      <Collapsible>
        <CollapsibleTrigger asChild><button type="button">T</button></CollapsibleTrigger>
        <CollapsibleContent asChild><section>Body</section></CollapsibleContent>
      </Collapsible>,
      <Next.Collapsible>
        <Next.CollapsibleTrigger asChild><button type="button">T</button></Next.CollapsibleTrigger>
        <Next.CollapsibleContent asChild><section>Body</section></Next.CollapsibleContent>
      </Next.Collapsible>,
      () => {
        document.querySelector("button")?.click();
      },
    );
  });
});

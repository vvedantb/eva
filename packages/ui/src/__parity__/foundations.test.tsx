// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { describe, expect, test } from "vitest";
import { IconAlertTriangle } from "@tabler/icons-react";
import * as Next from "@vvedantb/ui";

import { evaUiConfig } from "../config";
import { Alert, AlertDescription } from "../__legacy__/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "../__legacy__/ui/avatar";
import { BorderBeam } from "../__legacy__/ui/border-beam";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../__legacy__/ui/card";
import { CenteredSpinner } from "../__legacy__/ui/centered-spinner";
import { CrossfadeIcon, CrossfadeIconSlot } from "../__legacy__/ui/crossfade-icon";
import { Label } from "../__legacy__/ui/label";
import { LIST_ROW_CONTROL_CLASS, ListRow } from "../__legacy__/ui/list-row";
import { LoadingState } from "../__legacy__/ui/loading-state";
import { Progress } from "../__legacy__/ui/progress";
import { RefreshSpinIcon } from "../__legacy__/ui/refresh-spin-icon";
import { Separator } from "../__legacy__/ui/separator";
import { Toaster, toast } from "../__legacy__/ui/sonner";
import { CircleSpinner, Spinner } from "../__legacy__/ui/spinner";
import { StatusDot, type StatusTone } from "../__legacy__/ui/status-dot";
import { Surface, surfaceVariants } from "../__legacy__/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../__legacy__/ui/table";
import { CAT_SLOT_COUNT, catColorForId, catColorForSlot, catSlotForId } from "../__legacy__/utils/cat-color";
import { DRAG_ACTIVATION_DISTANCE_PX, projectVelocity, rubberband } from "../__legacy__/utils/gesture";
import { motionBase, motionFast, motionSlow, motionSpring, motionStagger } from "../__legacy__/utils/motion";
import { msUntilNextBoundary, quantizedSnapshot } from "../__legacy__/utils/sharedClock";
import { CONTROL_RADIUS_CLASS, SURFACE_RADIUS_CLASS } from "../__legacy__/utils/surface-radius";
import { renderPair } from "./harness";

// happy-dom has no Web Animations API. Spinner, CircleSpinner and LoadingState
// start their loops with `element.animate()` in a ref callback; a no-op
// Animation lets both trees mount (the DOM is what is compared, not motion).
Object.defineProperty(Element.prototype, "animate", {
  configurable: true,
  value: () => ({ playState: "running", pause() {}, play() {}, cancel() {} }),
});

async function same(legacy: ReactNode, next: ReactNode, interact?: () => Promise<void> | void) {
  const pair = await renderPair(legacy, next, evaUiConfig, interact);
  expect(pair.next).toBe(pair.legacy);
  return pair.legacy;
}

const sizes = ["sm", "md", "lg"] as const;

describe("Spinner (eva mark via UiConfig.Spinner.mark)", () => {
  for (const size of sizes) {
    test(`size=${size}`, async () => {
      expect(await same(<Spinner size={size} />, <Next.Spinner size={size} />)).toContain("<polygon");
    });
  }
  test("default size, className, aria-label, aria-hidden", async () => {
    await same(<Spinner />, <Next.Spinner />);
    await same(<Spinner className="size-3.5 shrink-0" />, <Next.Spinner className="size-3.5 shrink-0" />);
    await same(<Spinner aria-label="Opening" />, <Next.Spinner aria-label="Opening" />);
    await same(<Spinner size="sm" aria-hidden />, <Next.Spinner size="sm" aria-hidden />);
  });
});

describe("CircleSpinner (eva colours via UiConfig.CircleSpinner.colors)", () => {
  for (const size of sizes) {
    test(`size=${size}`, () => same(<CircleSpinner size={size} />, <Next.CircleSpinner size={size} />));
  }
  test("call-site combinations", async () => {
    await same(<CircleSpinner />, <Next.CircleSpinner />);
    await same(<CircleSpinner size="sm" className="size-3.5" />, <Next.CircleSpinner size="sm" className="size-3.5" />);
    await same(
      <CircleSpinner size="sm" className="size-3 shrink-0" aria-hidden />,
      <Next.CircleSpinner size="sm" className="size-3 shrink-0" aria-hidden />,
    );
    await same(
      <CircleSpinner size="sm" style={{ width: 13, height: 13 }} className="shrink-0" />,
      <Next.CircleSpinner size="sm" style={{ width: 13, height: 13 }} className="shrink-0" />,
    );
    await same(<CircleSpinner size="md" aria-hidden="true" />, <Next.CircleSpinner size="md" aria-hidden="true" />);
  });
});

test("CenteredSpinner", async () => {
  await same(<CenteredSpinner label="Loading" />, <Next.CenteredSpinner label="Loading" />);
  await same(
    <CenteredSpinner label="Opening chat" className="h-full" data-x="1" />,
    <Next.CenteredSpinner label="Opening chat" className="h-full" data-x="1" />,
  );
});

describe("LoadingState", () => {
  const variants = ["Drive", "Dots", "Orbit"] as const;
  const loaderSizes = ["default", "sm"] as const;
  for (const variant of variants) {
    for (const size of loaderSizes) {
      test(`${variant} ${size} iconOnly`, () =>
        same(
          <LoadingState label="Working" variant={variant} size={size} iconOnly />,
          <Next.LoadingState label="Working" variant={variant} size={size} iconOnly />,
        ));
      test(`${variant} ${size} labelled`, () =>
        same(<LoadingState variant={variant} size={size} />, <Next.LoadingState variant={variant} size={size} />));
    }
  }
  test("defaults (label from config)", async () => {
    await same(<LoadingState />, <Next.LoadingState />);
    await same(<LoadingState iconOnly />, <Next.LoadingState iconOnly />);
  });
});

test("RefreshSpinIcon", async () => {
  for (const busy of [false, true]) {
    await same(<RefreshSpinIcon busy={busy} />, <Next.RefreshSpinIcon busy={busy} />);
    await same(<RefreshSpinIcon busy={busy} className="size-3.5" />, <Next.RefreshSpinIcon busy={busy} className="size-3.5" />);
  }
});

describe("CrossfadeIcon / CrossfadeIconSlot", () => {
  test("CrossfadeIcon", async () => {
    for (const show of [false, true]) {
      for (const variant of [undefined, "default", "soft"] as const) {
        await same(
          <CrossfadeIcon show={show} variant={variant} whenTrue={<b>on</b>} whenFalse={<i>off</i>} />,
          <Next.CrossfadeIcon show={show} variant={variant} whenTrue={<b>on</b>} whenFalse={<i>off</i>} />,
        );
      }
      await same(
        <CrossfadeIcon
          show={show}
          trueKey="loading"
          falseKey="idle"
          variant="soft"
          className="relative flex size-3.5 items-center justify-center"
          whenTrue={<Spinner size="sm" />}
          whenFalse={<i>idle</i>}
        />,
        <Next.CrossfadeIcon
          show={show}
          trueKey="loading"
          falseKey="idle"
          variant="soft"
          className="relative flex size-3.5 items-center justify-center"
          whenTrue={<Next.Spinner size="sm" />}
          whenFalse={<i>idle</i>}
        />,
      );
    }
  });
  test("CrossfadeIconSlot", async () => {
    for (const variant of [undefined, "default", "soft"] as const) {
      await same(
        <CrossfadeIconSlot iconKey="a" variant={variant}>
          <b>a</b>
        </CrossfadeIconSlot>,
        <Next.CrossfadeIconSlot iconKey="a" variant={variant}>
          <b>a</b>
        </Next.CrossfadeIconSlot>,
      );
    }
    await same(
      <CrossfadeIconSlot iconKey="go" className="relative flex size-[18px] items-center justify-center">
        <b>go</b>
      </CrossfadeIconSlot>,
      <Next.CrossfadeIconSlot iconKey="go" className="relative flex size-[18px] items-center justify-center">
        <b>go</b>
      </Next.CrossfadeIconSlot>,
    );
  });
});

describe("BorderBeam", () => {
  const colorVariants = ["mono", "progress", "colorful"] as const;
  for (const active of [false, true]) {
    for (const size of sizes) {
      for (const colorVariant of colorVariants) {
        test(`active=${active} size=${size} color=${colorVariant}`, () =>
          same(
            <BorderBeam active={active} size={size} colorVariant={colorVariant} className="rounded-surface">
              <div className="bg-card">child</div>
            </BorderBeam>,
            <Next.BorderBeam active={active} size={size} colorVariant={colorVariant} className="rounded-surface">
              <div className="bg-card">child</div>
            </Next.BorderBeam>,
          ));
      }
    }
  }
  test("defaults and rest props", () =>
    same(
      <BorderBeam active data-state="open" id="beam">
        <span>x</span>
      </BorderBeam>,
      <Next.BorderBeam active data-state="open" id="beam">
        <span>x</span>
      </Next.BorderBeam>,
    ));
});

describe("StatusDot", () => {
  const tones: StatusTone[] = [
    "progress",
    "business-review",
    "code-review",
    "done",
    "cancelled",
    "active",
    "critical",
    "neutral",
  ];
  for (const tone of tones) {
    test(tone, async () => {
      await same(<StatusDot tone={tone} />, <Next.StatusDot tone={tone} />);
      await same(<StatusDot tone={tone} size="md" />, <Next.StatusDot tone={tone} size="md" />);
    });
  }
  test("aria-hidden false, className, rest", () =>
    same(
      <StatusDot tone="done" aria-hidden={false} className="mt-1" title="Done" />,
      <Next.StatusDot tone="done" aria-hidden={false} className="mt-1" title="Done" />,
    ));
});

test("Surface", async () => {
  for (const density of [undefined, "tight", "default", "comfortable", "none"] as const) {
    await same(<Surface density={density}>x</Surface>, <Next.Surface density={density}>x</Next.Surface>);
  }
  await same(
    <Surface density="tight" className="flex min-w-0 flex-col gap-3 [&:fullscreen]:rounded-none">
      x
    </Surface>,
    <Next.Surface density="tight" className="flex min-w-0 flex-col gap-3 [&:fullscreen]:rounded-none">
      x
    </Next.Surface>,
  );
  expect(Next.surfaceVariants({ density: "tight" })).toBe(surfaceVariants({ density: "tight" }));
});

describe("ListRow", () => {
  const noop = () => {};
  const cases: [string, (Row: typeof ListRow) => ReactNode][] = [
    ["static", (Row) => <Row>body</Row>],
    ["selected + accent", (Row) => <Row selected accentClassName="bg-status-progress-bar">body</Row>],
    ["onClick", (Row) => <Row onClick={noop} aria-label="Open">body</Row>],
    ["onClick selected", (Row) => <Row onClick={noop} selected>body</Row>],
    ["href", (Row) => <Row href="https://example.com" aria-label="Out">body</Row>],
    ["link", (Row) => <Row link={<a href="/x" />} aria-label="In" className="shrink-0 ring-2 ring-primary/40">body</Row>],
    [
      "content, decoration, rest",
      (Row) => (
        <Row onClick={noop} contentClassName="p-3" decoration={<span className="glow" />} data-x="1">
          <button className={LIST_ROW_CONTROL_CLASS}>c</button>
        </Row>
      ),
    ],
  ];
  for (const [name, make] of cases) {
    test(name, () => same(make(ListRow), make(Next.ListRow)));
  }
  test("LIST_ROW_CONTROL_CLASS", () => expect(Next.LIST_ROW_CONTROL_CLASS).toBe(LIST_ROW_CONTROL_CLASS));
});

test("Avatar", async () => {
  await same(
    <Avatar>
      <AvatarImage src="/a.png" alt="A" />
      <AvatarFallback>AB</AvatarFallback>
    </Avatar>,
    <Next.Avatar>
      <Next.AvatarImage src="/a.png" alt="A" />
      <Next.AvatarFallback>AB</Next.AvatarFallback>
    </Next.Avatar>,
  );
  await same(
    <Avatar className="size-8 rounded-lg shrink-0">
      <AvatarFallback className="rounded-lg bg-primary/10">X</AvatarFallback>
    </Avatar>,
    <Next.Avatar className="size-8 rounded-lg shrink-0">
      <Next.AvatarFallback className="rounded-lg bg-primary/10">X</Next.AvatarFallback>
    </Next.Avatar>,
  );
});

test("Alert", async () => {
  for (const variant of [undefined, "default", "destructive"] as const) {
    await same(
      <Alert variant={variant}>
        <IconAlertTriangle />
        <AlertDescription>Body</AlertDescription>
      </Alert>,
      <Next.Alert variant={variant}>
        <IconAlertTriangle />
        <Next.AlertDescription>Body</Next.AlertDescription>
      </Next.Alert>,
    );
  }
  await same(
    <Alert className="flex flex-col gap-2">
      <AlertDescription className="text-xs">x</AlertDescription>
    </Alert>,
    <Next.Alert className="flex flex-col gap-2">
      <Next.AlertDescription className="text-xs">x</Next.AlertDescription>
    </Next.Alert>,
  );
});

describe("Toaster (eva Toaster → vvedantb Toaster under UiConfig.SonnerToaster)", () => {
  test("empty", () =>
    same(<Toaster theme="dark" position="top-right" />, <Next.Toaster theme="dark" position="top-right" />));
  test("with toasts", async () => {
    const html = await same(<Toaster theme="light" position="top-right" />, <Next.Toaster theme="light" position="top-right" />, () => {
      // Both toast functions resolve to one sonner store or two; either way each
      // render receives the same toasts.
      for (const fire of [toast, Next.toast]) {
        fire("Plain");
        fire.success("Saved", { description: "All good" });
        fire.error("Failed", { action: { label: "Retry", onClick: () => {} } });
        fire.warning("Careful", { cancel: { label: "Dismiss", onClick: () => {} } });
        fire.info("FYI");
        fire.loading("Working");
      }
    });
    for (const text of ["Plain", "All good", "Retry", "Dismiss", "Working"]) expect(html).toContain(text);
  });
});

test("Progress", async () => {
  for (const value of [undefined, 0, 40, 100]) {
    await same(<Progress value={value} />, <Next.Progress value={value} />);
  }
  await same(<Progress value={30} className="h-1" />, <Next.Progress value={30} className="h-1" />);
});

test("Separator", async () => {
  await same(<Separator />, <Next.Separator />);
  await same(<Separator orientation="vertical" />, <Next.Separator orientation="vertical" />);
  await same(
    <Separator decorative={false} className="my-2" />,
    <Next.Separator decorative={false} className="my-2" />,
  );
});

test("Label", async () => {
  await same(<Label htmlFor="x">Name</Label>, <Next.Label htmlFor="x">Name</Next.Label>);
  await same(<Label className="text-xs">Name</Label>, <Next.Label className="text-xs">Name</Next.Label>);
});

test("Card", async () => {
  await same(
    <Card>
      <CardHeader>
        <CardTitle>T</CardTitle>
        <CardDescription>D</CardDescription>
        <CardAction>A</CardAction>
      </CardHeader>
      <CardContent>C</CardContent>
      <CardFooter>F</CardFooter>
    </Card>,
    <Next.Card>
      <Next.CardHeader>
        <Next.CardTitle>T</Next.CardTitle>
        <Next.CardDescription>D</Next.CardDescription>
        <Next.CardAction>A</Next.CardAction>
      </Next.CardHeader>
      <Next.CardContent>C</Next.CardContent>
      <Next.CardFooter>F</Next.CardFooter>
    </Next.Card>,
  );
  await same(
    <Card className="h-full transition-colors hover:bg-muted/50">
      <CardHeader className="max-sm:pr-10">
        <CardTitle className="text-base">T</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-2 p-3 sm:p-4">C</CardContent>
    </Card>,
    <Next.Card className="h-full transition-colors hover:bg-muted/50">
      <Next.CardHeader className="max-sm:pr-10">
        <Next.CardTitle className="text-base">T</Next.CardTitle>
      </Next.CardHeader>
      <Next.CardContent className="flex items-center justify-between gap-2 p-3 sm:p-4">C</Next.CardContent>
    </Next.Card>,
  );
});

test("Table", async () => {
  const body = (T: {
    Table: typeof Table;
    TableHeader: typeof TableHeader;
    TableBody: typeof TableBody;
    TableRow: typeof TableRow;
    TableHead: typeof TableHead;
    TableCell: typeof TableCell;
  }) => (
    <T.Table className="min-w-[360px]">
      <T.TableHeader>
        <T.TableRow className="hover:bg-transparent">
          <T.TableHead>
            <span role="checkbox" aria-checked="false" />
          </T.TableHead>
          <T.TableHead className="px-2.5 text-right sm:px-4">Name</T.TableHead>
        </T.TableRow>
      </T.TableHeader>
      <T.TableBody>
        <T.TableRow data-state="selected">
          <T.TableCell>
            <span role="checkbox" aria-checked="true" />
          </T.TableCell>
          <T.TableCell className="px-2.5 sm:px-4">A</T.TableCell>
        </T.TableRow>
      </T.TableBody>
    </T.Table>
  );
  await same(body({ Table, TableHeader, TableBody, TableRow, TableHead, TableCell }), body(Next));
});

describe("utils keep eva's values", () => {
  test("motion tokens", () => {
    expect(Next.transitionFast).toEqual(motionFast);
    expect(Next.transitionBase).toEqual(motionBase);
    expect(Next.transitionSlow).toEqual(motionSlow);
    expect(Next.springTransition).toEqual(motionSpring);
    for (const i of [0, 1, 5, 20]) expect(Next.staggerDelay(i)).toBe(motionStagger(i));
    expect(Next.staggerDelay(3, 0.05, 0.1)).toBe(motionStagger(3, 0.05, 0.1));
  });
  test("gesture", () => {
    expect(Next.DRAG_ACTIVATION_DISTANCE_PX).toBe(DRAG_ACTIVATION_DISTANCE_PX);
    for (const [o, d] of [[0, 100], [40, 100], [-40, 100], [5000, 320]] as const) {
      expect(Next.rubberband(o, d)).toBe(rubberband(o, d));
    }
    expect(Next.rubberband(50, 100, 0.9)).toBe(rubberband(50, 100, 0.9));
    for (const v of [0, 1200, -800]) expect(Next.projectVelocity(v)).toBe(projectVelocity(v));
    expect(Next.projectVelocity(1000, 0.99)).toBe(projectVelocity(1000, 0.99));
  });
  test("shared clock", () => {
    expect(Next.quantizedSnapshot(1000, 1_700_000_000_123)).toBe(quantizedSnapshot(1000, 1_700_000_000_123));
    expect(Next.msUntilNextBoundary(1000, 1_700_000_000_250)).toBe(msUntilNextBoundary(1000, 1_700_000_000_250));
  });
  test("cat colours", () => {
    expect(Next.CAT_SLOT_COUNT).toBe(CAT_SLOT_COUNT);
    for (const id of ["", "a", "repo/eva", "session-123", "ünïcødé"]) {
      expect(Next.catSlotForId(id)).toBe(catSlotForId(id));
      expect(Next.catColorForId(id)).toEqual(catColorForId(id));
    }
    for (const slot of [1, 2, 3, 4, 5, 6, 7, 8] as const) expect(Next.catColorForSlot(slot)).toEqual(catColorForSlot(slot));
  });
  test("radius classes", () => {
    expect(Next.SURFACE_RADIUS_CLASS).toBe(SURFACE_RADIUS_CLASS);
    expect(Next.CONTROL_RADIUS_CLASS).toBe(CONTROL_RADIUS_CLASS);
  });
});

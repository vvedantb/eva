// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { describe, expect, test } from "vitest";
import { domMax, LazyMotion, MotionGlobalConfig } from "motion/react";
import {
  IconCopy,
  IconDownload,
  IconMicrophone,
  IconRefresh,
  IconShare,
  IconWorld,
} from "@tabler/icons-react";
import * as Next from "@vvedantb/ui";

import { evaUiConfig } from "../config";
import * as LegacyArtifact from "../ai-elements/artifact";
import * as LegacyAttachments from "../ai-elements/attachments";
import * as LegacyCodeBlock from "../ai-elements/code-block";
import * as LegacyConfirmation from "../ai-elements/confirmation";
import * as LegacyConversation from "../ai-elements/conversation";
import { FileChip as LegacyFileChip } from "../ai-elements/file-chip";
import * as LegacyMessage from "../ai-elements/message";
import * as LegacyPromptInput from "../ai-elements/prompt-input";
import { PromptInputSettings as LegacyPromptInputSettings } from "../ai-elements/prompt-input-settings";
import { PromptInputSpeech as LegacyPromptInputSpeech } from "../ai-elements/prompt-input-speech";
import { TraitsPanel as LegacyTraitsPanel } from "../ai-elements/prompt-input-traits";
import * as LegacyQueue from "../ai-elements/queue";
import * as LegacySandbox from "../ai-elements/sandbox";
import { Shimmer as LegacyShimmer } from "../ai-elements/shimmer";
import { TooltipProvider as LegacyTooltipProvider } from "../ui/tooltip";
import { renderPair } from "./harness";

// happy-dom has no Web Animations API (the submit spinner starts its loop with
// `element.animate()`), and motion's springs would otherwise leave each tree
// at an arbitrary frame: animations jump to their end so the DOM is stable.
Object.defineProperty(Element.prototype, "animate", {
  configurable: true,
  value: () => ({ playState: "running", pause() {}, play() {}, cancel() {} }),
});
MotionGlobalConfig.skipAnimations = true;

/** eva's app shell: strict LazyMotion (a `motion.*` component would throw). */
const Shell = ({ children }: { children: ReactNode }) => (
  <LazyMotion features={domMax} strict>
    {children}
  </LazyMotion>
);

async function same(
  legacy: ReactNode,
  next: ReactNode,
  interact?: () => Promise<void> | void,
  normalise: (html: string) => string = (html) => html,
) {
  const pair = await renderPair(<Shell>{legacy}</Shell>, <Shell>{next}</Shell>, evaUiConfig, interact);
  expect(normalise(pair.next)).toBe(normalise(pair.legacy));
  return pair.legacy;
}

/**
 * vvedantb's `TabsList` marks eva's segmented look with `data-variant`; eva
 * neither renders nor targets it (same exception as `controls.test.tsx`).
 */
const stripTabsVariant = (html: string) => html.replaceAll(' data-variant="segmented"', "");

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const noop = () => {};

// ---------------------------------------------------------------------------
// Conversation

describe("Conversation", () => {
  const tree = (
    C: typeof LegacyConversation | typeof Next,
    props: { root?: string; content?: string; scroll?: string; resize?: "smooth" | "instant" } = {},
  ) => (
    <C.Conversation className={props.root} resize={props.resize}>
      <C.ConversationContent className={props.content} scrollClassName={props.scroll}>
        <C.ConversationEmptyState />
      </C.ConversationContent>
    </C.Conversation>
  );

  test("defaults", async () => {
    expect(await same(tree(LegacyConversation), tree(Next))).toContain("scroll-fade");
  });

  // ChatBody, SubagentThreadView, ProjectChatTab, gallery.
  test.each([
    { root: "flex-1 min-h-0", content: "gap-3 p-3 max-w-3xl mx-auto w-full", scroll: "[container-type:size] [overflow-anchor:none]", resize: "instant" as const },
    { root: "min-h-0 flex-1", content: "mx-auto w-full max-w-3xl gap-3 p-3" },
    { root: "flex-1 min-h-0", content: "gap-3 p-3 max-w-5xl mx-auto w-full" },
    { root: "h-[420px] w-[36rem] rounded-surface bg-card" },
  ])("call site %o", async (props) => {
    await same(tree(LegacyConversation, props), tree(Next, props));
  });

  test.each([
    {},
    { title: "No activity yet" },
    { title: "No recorded activity for this agent.", description: "Transcripts are recorded for agents started from now on.", icon: <IconRefresh className="size-10" /> },
    { children: <div className="space-y-1">custom</div>, className: "h-40" },
  ])("ConversationEmptyState %#", async (props) => {
    await same(
      <LegacyConversation.ConversationEmptyState {...props} />,
      <Next.ConversationEmptyState {...props} />,
    );
  });

  test("ConversationDownload", async () => {
    const messages = [{ role: "user" as const, content: "hi" }];
    await same(
      <LegacyConversation.ConversationDownload messages={messages} />,
      <Next.ConversationDownload messages={messages} />,
    );
    await same(
      <LegacyConversation.ConversationDownload messages={messages} className="top-2">
        <IconDownload />
      </LegacyConversation.ConversationDownload>,
      <Next.ConversationDownload messages={messages} className="top-2">
        <IconDownload />
      </Next.ConversationDownload>,
    );
  });

  const scrollTree = (
    C: typeof LegacyConversation | typeof Next,
    button: { resetKey?: string; className?: string },
  ) => (
    // `initial={false}` starts the stick-to-bottom state away from the bottom.
    <C.Conversation initial={false}>
      <C.ConversationContent>
        <p>row</p>
      </C.ConversationContent>
      <C.ConversationScrollButton {...button} />
    </C.Conversation>
  );

  test("scroll button: hidden at first, frame only", async () => {
    const html = await same(scrollTree(LegacyConversation, {}), scrollTree(Next, {}));
    expect(html).not.toContain("Scroll to end");
  });

  test.each([{}, { resetKey: "thread-1" }, { className: "bottom-2" }])(
    "scroll button: shown after the 150 ms delay %o",
    async (button) => {
      const html = await same(scrollTree(LegacyConversation, button), scrollTree(Next, button), () => wait(200));
      expect(html).toContain('aria-label="Scroll to end"');
    },
  );

  test("scroll button: not yet shown at 100 ms", async () => {
    const html = await same(scrollTree(LegacyConversation, {}), scrollTree(Next, {}), () => wait(100));
    expect(html).not.toContain("Scroll to end");
  });

  test("scroll button: click", async () => {
    await same(scrollTree(LegacyConversation, {}), scrollTree(Next, {}), async () => {
      await wait(200);
      document.querySelector<HTMLButtonElement>('button[aria-label="Scroll to end"]')?.click();
      await wait(50);
    });
  });
});

// ---------------------------------------------------------------------------
// Message

describe("Message", () => {
  const messageTree = (
    M: typeof LegacyMessage | typeof Next,
    from: "user" | "assistant",
    root?: string,
    content?: string,
  ) => (
    <M.Message from={from} className={root}>
      <M.MessageContent className={content}>Hello</M.MessageContent>
    </M.Message>
  );

  // ChatMessage, plan/ChatMessage, SubagentThreadView.
  test.each([
    ["user", undefined, undefined],
    ["assistant", undefined, undefined],
    ["user", "ml-0 mr-auto justify-start gap-1.5", "group px-3 py-2 text-foreground bg-secondary group-[.is-user]:ml-0 group-[.is-user]:bg-secondary"],
    ["user", undefined, "group px-3 py-2 text-foreground rounded-surface bg-primary/10 group-[.is-user]:bg-primary/10"],
    ["user", undefined, "group px-3 py-2 text-foreground rounded-surface bg-muted group-[.is-user]:bg-muted"],
    ["user", undefined, "rounded-surface bg-secondary text-foreground px-4 py-3"],
    ["assistant", undefined, "px-1 py-2"],
    ["user", undefined, "rounded-surface bg-muted px-3 py-2 text-foreground group-[.is-user]:bg-muted"],
  ] as const)("from=%s root=%s content=%s", async (from, root, content) => {
    await same(messageTree(LegacyMessage, from, root, content), messageTree(Next, from, root, content));
  });

  // eva `MessageActions` is vvedantb `MessageActionsBar` (renamed at call sites).
  const actions = (M: "legacy" | "next", interact?: boolean) => {
    const Bar = M === "legacy" ? LegacyMessage.MessageActions : Next.MessageActionsBar;
    const Action = M === "legacy" ? LegacyMessage.MessageAction : Next.MessageAction;
    return (
      <Bar className="gap-0.5 reveal-on-hover transition-opacity">
        <Action
          tooltip="Copy"
          label="Copy message"
          size="icon-xs"
          onClick={noop}
          className="hit-target text-muted-foreground hover:text-foreground"
          data-interact={interact ? "" : undefined}
        >
          <IconCopy />
        </Action>
        <Action
          tooltip="Retry"
          label="Retry"
          size="icon-xs"
          disabled
          aria-pressed
          className="hit-target text-muted-foreground hover:text-foreground text-foreground"
        >
          <IconRefresh />
        </Action>
        <Action>
          <IconShare />
        </Action>
        {/* MarkdownCodeBlock */}
        <Action tooltip="Wrap long lines" size="icon-xs" aria-pressed={false} className="text-muted-foreground">
          <IconWorld />
        </Action>
      </Bar>
    );
  };

  test("MessageActions + MessageAction (tooltips not armed)", async () => {
    const html = await same(actions("legacy"), actions("next"));
    expect(html).not.toContain("data-state");
  });

  test("MessageAction arms its tooltip on hover", async () => {
    const html = await same(
      <LegacyTooltipProvider>{actions("legacy")}</LegacyTooltipProvider>,
      <Next.TooltipProvider>{actions("next")}</Next.TooltipProvider>,
      () => {
        document
          .querySelector("button")
          // React derives `onPointerEnter` from `pointerover`.
          ?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      },
    );
    expect(html).toContain('data-state="closed"');
  });

  test("MessageAction arms and opens its tooltip on focus", async () => {
    const html = await same(
      <LegacyTooltipProvider>{actions("legacy")}</LegacyTooltipProvider>,
      <Next.TooltipProvider>{actions("next")}</Next.TooltipProvider>,
      () => {
        document.querySelector("button")?.focus();
      },
    );
    expect(html).toContain('role="tooltip"');
  });

  const branch = (M: typeof LegacyMessage | typeof Next) => (
    <M.MessageBranch defaultBranch={1} className="w-[32rem]">
      <M.MessageBranchContent>
        <M.Message from="assistant" key="b1">
          <M.MessageContent>First</M.MessageContent>
        </M.Message>
        <M.Message from="assistant" key="b2">
          <M.MessageContent>Second</M.MessageContent>
        </M.Message>
      </M.MessageBranchContent>
      <M.MessageToolbar>
        <M.MessageBranchSelector>
          <M.MessageBranchPrevious />
          <M.MessageBranchPage />
          <M.MessageBranchNext />
        </M.MessageBranchSelector>
      </M.MessageToolbar>
    </M.MessageBranch>
  );

  test("MessageBranch + toolbar", async () => {
    expect(await same(branch(LegacyMessage), branch(Next))).toContain("2 of 2");
  });

  test("MessageBranch next", async () => {
    const html = await same(branch(LegacyMessage), branch(Next), () => {
      document.querySelector<HTMLButtonElement>('button[aria-label="Next branch"]')?.click();
    });
    expect(html).toContain("1 of 2");
  });
});

// ---------------------------------------------------------------------------
// PromptInput

const SAMPLE_ATTACHMENTS = [
  { id: "a1", type: "file" as const, mediaType: "image/png", filename: "shot.png", url: "https://example.com/a.png" },
  { id: "a2", type: "file" as const, mediaType: "application/pdf", filename: "spec.pdf", url: "https://example.com/b.pdf" },
  { id: "a3", type: "source-document" as const, sourceId: "s", mediaType: "text/html", title: "Docs", filename: "docs.html" },
];

describe("PromptInput", () => {
  /** The ui-gallery sample: every part, both selects and the menu. */
  const sample = (
    P: typeof LegacyPromptInput | typeof Next,
    A: typeof LegacyAttachments | typeof Next,
    opts: { status?: "submitted" | "streaming" | "error"; attachments?: boolean } = {},
  ) => (
    <P.PromptInput onSubmit={noop} className="w-[36rem]">
      {opts.attachments ? (
        <P.PromptInputHeader>
          <A.Attachments variant="inline">
            {SAMPLE_ATTACHMENTS.map((data) => (
              <A.Attachment data={data} key={data.id} onRemove={noop}>
                <A.AttachmentPreview />
                <A.AttachmentInfo />
                <A.AttachmentRemove />
              </A.Attachment>
            ))}
          </A.Attachments>
        </P.PromptInputHeader>
      ) : null}
      <P.PromptInputBody>
        <P.PromptInputTextarea defaultValue={opts.attachments ? "Fix this" : undefined} />
      </P.PromptInputBody>
      <P.PromptInputFooter>
        <P.PromptInputTools>
          <P.PromptInputActionMenu>
            <P.PromptInputActionMenuTrigger />
            <P.PromptInputActionMenuContent>
              <P.PromptInputActionAddAttachments />
              <P.PromptInputActionMenuItem>Paste link</P.PromptInputActionMenuItem>
            </P.PromptInputActionMenuContent>
          </P.PromptInputActionMenu>
          <P.PromptInputButton tooltip="Dictate">
            <IconMicrophone className="size-4" />
          </P.PromptInputButton>
          <P.PromptInputButton tooltip={{ content: "Search", shortcut: "⌘K", side: "bottom" }}>
            <IconWorld className="size-4" />
            <span>Search</span>
          </P.PromptInputButton>
          <P.PromptInputSelect value="sonnet">
            <P.PromptInputSelectTrigger>
              <P.PromptInputSelectValue />
            </P.PromptInputSelectTrigger>
            <P.PromptInputSelectContent>
              <P.PromptInputSelectItem value="sonnet">Sonnet</P.PromptInputSelectItem>
              <P.PromptInputSelectItem value="opus">Opus</P.PromptInputSelectItem>
            </P.PromptInputSelectContent>
          </P.PromptInputSelect>
        </P.PromptInputTools>
        <P.PromptInputSubmit status={opts.status} />
      </P.PromptInputFooter>
    </P.PromptInput>
  );

  const pair = (opts: Parameters<typeof sample>[2]) =>
    [
      <LegacyTooltipProvider key="l">{sample(LegacyPromptInput, LegacyAttachments, opts)}</LegacyTooltipProvider>,
      <Next.TooltipProvider key="n">{sample(Next, Next, opts)}</Next.TooltipProvider>,
    ] as const;

  test.each([undefined, "submitted", "streaming", "error"] as const)("gallery sample, status=%s", async (status) => {
    const [legacy, next] = pair({ status });
    expect(await same(legacy, next)).toContain('name="message"');
  });

  test("gallery sample with inline attachments", async () => {
    const [legacy, next] = pair({ attachments: true });
    expect(await same(legacy, next)).toContain("shot.png");
  });

  test("action menu open", async () => {
    const [legacy, next] = pair({});
    const html = await same(legacy, next, () => {
      const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
      trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    });
    expect(html).toContain('role="menu"');
  });

  test("status change cross-fades the submit icon", async () => {
    const tree = (P: typeof LegacyPromptInput | typeof Next, status?: "streaming") => (
      <P.PromptInput onSubmit={noop}>
        <P.PromptInputSubmit status={status} className="size-9" title="Send message" disabled />
      </P.PromptInput>
    );
    await same(tree(LegacyPromptInput, "streaming"), tree(Next, "streaming"));
    await same(tree(LegacyPromptInput), tree(Next));
  });

  /** ComposerInputChrome: provider, data drop, inputGroupClassName, compact and expanded. */
  const composer = (P: typeof LegacyPromptInput | typeof Next, compact: boolean, dataDrop: boolean) => (
    <P.PromptInputProvider initialInput="draft">
      <P.PromptInput
        data-mention-popup-anchor=""
        onSubmit={noop}
        accept="image/*,.html"
        multiple
        maxFiles={10}
        maxFileSize={1024}
        onError={noop}
        dataDrop={dataDrop ? { type: "application/x-pr", onDrop: noop } : undefined}
        inputGroupClassName={[
          "[interpolate-size:allow-keywords] transition-[color,box-shadow,border-color,border-radius,height] duration-[var(--motion-base)]",
          compact ? "h-12 items-center rounded-full py-1" : "h-auto rounded-surface",
        ].join(" ")}
      >
        <textarea name="message" className="w-full" />
        <P.PromptInputFooter className="max-sm:gap-y-2 px-3 pb-3 pt-0">
          <P.PromptInputTools>
            <P.PromptInputActionMenu>
              <P.PromptInputActionMenuTrigger
                aria-label="Add to message"
                className={compact ? "size-8 shrink-0 rounded-full bg-muted text-foreground hover:bg-muted/80 hover:text-foreground" : undefined}
              />
              <P.PromptInputActionMenuContent className="min-w-52" />
            </P.PromptInputActionMenu>
            <P.PromptInputButton tooltip="Voice input" aria-label="Voice input" className="text-destructive" disabled>
              <IconMicrophone className="size-4" />
            </P.PromptInputButton>
          </P.PromptInputTools>
          <P.PromptInputSubmit disabled status="submitted" className="size-9" title="Uploading attachments…" />
        </P.PromptInputFooter>
      </P.PromptInput>
    </P.PromptInputProvider>
  );

  test.each([
    [false, false],
    [true, true],
  ])("ComposerInputChrome compact=%s dataDrop=%s", async (compact, dataDrop) => {
    await same(
      <LegacyTooltipProvider>{composer(LegacyPromptInput, compact, dataDrop)}</LegacyTooltipProvider>,
      <Next.TooltipProvider>{composer(Next, compact, dataDrop)}</Next.TooltipProvider>,
    );
  });

  test("drag-over highlight for a file drag and for the data drop type", async () => {
    for (const type of ["Files", "application/x-pr"]) {
      const html = await same(
        <LegacyTooltipProvider>{composer(LegacyPromptInput, false, true)}</LegacyTooltipProvider>,
        <Next.TooltipProvider>{composer(Next, false, true)}</Next.TooltipProvider>,
        () => {
          const event = new Event("dragenter", { bubbles: true });
          Object.defineProperty(event, "dataTransfer", { value: { types: [type] } });
          // happy-dom's DragEvent: the component checks `instanceof DragEvent`.
          Object.setPrototypeOf(event, DragEvent.prototype);
          document.querySelector("form")?.dispatchEvent(event);
        },
      );
      expect(html).toContain("border-primary");
    }
  });

  test("PromptInput defaults (no provider, rounded-control)", async () => {
    const tree = (P: typeof LegacyPromptInput | typeof Next) => (
      <P.PromptInput onSubmit={noop}>
        <P.PromptInputTextarea placeholder="Ask" className="min-h-10" />
      </P.PromptInput>
    );
    expect(await same(tree(LegacyPromptInput), tree(Next))).toContain("rounded-control");
  });

  test("tabs, hover card and command parts", async () => {
    const tree = (P: typeof LegacyPromptInput | typeof Next) => (
      <>
        <P.PromptInputTabsList className="p-1">
          <P.PromptInputTab>
            <P.PromptInputTabLabel>Recent</P.PromptInputTabLabel>
            <P.PromptInputTabBody>
              <P.PromptInputTabItem>file.ts</P.PromptInputTabItem>
            </P.PromptInputTabBody>
          </P.PromptInputTab>
        </P.PromptInputTabsList>
        <P.PromptInputHoverCard open>
          <P.PromptInputHoverCardTrigger asChild>
            <button type="button">@</button>
          </P.PromptInputHoverCardTrigger>
          <P.PromptInputHoverCardContent>Card</P.PromptInputHoverCardContent>
        </P.PromptInputHoverCard>
        <P.PromptInputCommand>
          <P.PromptInputCommandInput placeholder="Search" />
          <P.PromptInputCommandList>
            <P.PromptInputCommandEmpty>None</P.PromptInputCommandEmpty>
            <P.PromptInputCommandGroup heading="Files">
              <P.PromptInputCommandItem>a.ts</P.PromptInputCommandItem>
            </P.PromptInputCommandGroup>
            <P.PromptInputCommandSeparator />
          </P.PromptInputCommandList>
        </P.PromptInputCommand>
      </>
    );
    expect(await same(tree(LegacyPromptInput), tree(Next))).toContain("Card");
  });
});

describe("PromptInputSpeech", () => {
  test("null without the Web Speech API", async () => {
    expect(await same(<LegacyPromptInputSpeech disabled />, <Next.PromptInputSpeech disabled />)).not.toContain(
      "<button",
    );
  });

  test("button with the Web Speech API", async () => {
    class FakeRecognition extends EventTarget {}
    Object.assign(window, { webkitSpeechRecognition: FakeRecognition });
    try {
      const tree = (P: typeof LegacyPromptInput | typeof Next, Speech: typeof LegacyPromptInputSpeech) => (
        <P.PromptInput onSubmit={noop}>
          <Speech disabled />
        </P.PromptInput>
      );
      const html = await same(
        <LegacyTooltipProvider>{tree(LegacyPromptInput, LegacyPromptInputSpeech)}</LegacyTooltipProvider>,
        <Next.TooltipProvider>{tree(Next, Next.PromptInputSpeech)}</Next.TooltipProvider>,
      );
      expect(html).toContain("tabler-icon-microphone");
    } finally {
      Reflect.deleteProperty(window, "webkitSpeechRecognition");
    }
  });
});

describe("PromptInputSettings", () => {
  const one = [
    { id: "claude-sonnet", provider: "claude", label: "Sonnet" },
    { id: "claude-opus", provider: "claude", label: "Opus" },
  ];
  const many = [...one, { id: "gpt-5", provider: "codex", label: "GPT-5" }];

  test.each([
    ["one provider", one],
    ["several providers", many],
  ] as const)("trigger, %s", async (_, options) => {
    await same(
      <LegacyPromptInputSettings model="claude-sonnet" onModelChange={noop} options={options} />,
      <Next.PromptInputSettings model="claude-sonnet" onModelChange={noop} options={options} />,
    );
  });

  test.each([
    ["one provider", one],
    ["several providers", many],
  ] as const)("menu open, %s", async (_, options) => {
    const html = await same(
      <LegacyPromptInputSettings model="gpt-5" onModelChange={noop} options={options} disabled={false} className="ml-1" />,
      <Next.PromptInputSettings model="gpt-5" onModelChange={noop} options={options} disabled={false} className="ml-1" />,
      () => {
        document.querySelector("button")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      },
    );
    expect(html).toContain("Model");
  });
});

describe("TraitsPanel", () => {
  const props = {
    effortLevel: "high",
    thinkingEnabled: true,
    use1mContext: false,
    fastMode: false,
    getLevelLabel: (level: string) => level.toUpperCase(),
    onEffortLevelChange: noop,
    onThinkingEnabledChange: noop,
    onUse1mContextChange: noop,
    onFastModeChange: noop,
  };
  const full = {
    reasoning: { levels: ["low", "medium", "high"], default: "medium", ultrathink: true },
    thinkingToggle: true,
    contextWindow1m: true,
    contextWindowDefaultLabel: "200K",
    fastMode: true,
  };

  test.each([
    ["all traits", full, false],
    ["no traits (empty states)", {}, false],
    ["disabled", full, true],
  ] as const)("%s", async (_, config, disabled) => {
    await same(
      <LegacyTraitsPanel config={config} disabled={disabled} className="w-80" {...props} />,
      <Next.TraitsPanel config={config} disabled={disabled} className="w-80" {...props} />,
    );
  });

  test("ultrathink in the prompt body (inside a composer)", async () => {
    const tree = (P: typeof LegacyPromptInput | typeof Next, Panel: typeof LegacyTraitsPanel) => (
      <P.PromptInputProvider initialInput="Ultrathink:\nplease ultrathink this">
        <Panel config={full} {...props} />
      </P.PromptInputProvider>
    );
    expect(await same(tree(LegacyPromptInput, LegacyTraitsPanel), tree(Next, Next.TraitsPanel))).toContain(
      "Remove it",
    );
  });
});

// ---------------------------------------------------------------------------
// Queue (eva `Queue`, `QueueList`, `QueueItem` = vvedantb `QueuePanel`,
// `QueuePanelList`, `QueuePanelItem`)

describe("QueuePanel", () => {
  const legacy = (
    <LegacyQueue.Queue className="w-96">
      <LegacyQueue.QueueSection>
        <LegacyQueue.QueueSectionTrigger>
          <LegacyQueue.QueueSectionLabel count={2} label="queued" icon={<IconRefresh className="size-3.5" />} />
        </LegacyQueue.QueueSectionTrigger>
        <LegacyQueue.QueueSectionContent>
          <LegacyQueue.QueueList>
            {[false, true].map((done) => (
              <LegacyQueue.QueueItem key={String(done)}>
                <div className="flex items-start gap-2">
                  <LegacyQueue.QueueItemIndicator completed={done} />
                  <LegacyQueue.QueueItemContent completed={done}>Item</LegacyQueue.QueueItemContent>
                  <LegacyQueue.QueueItemActions>
                    <LegacyQueue.QueueItemAction aria-label="Edit">
                      <IconCopy className="size-3.5" />
                    </LegacyQueue.QueueItemAction>
                  </LegacyQueue.QueueItemActions>
                </div>
              </LegacyQueue.QueueItem>
            ))}
          </LegacyQueue.QueueList>
        </LegacyQueue.QueueSectionContent>
      </LegacyQueue.QueueSection>
      <LegacyQueue.QueueSection defaultOpen={false}>
        <LegacyQueue.QueueSectionTrigger className="pr-2">
          <LegacyQueue.QueueSectionLabel count={1} label="closed" />
        </LegacyQueue.QueueSectionTrigger>
        <LegacyQueue.QueueSectionContent>
          <LegacyQueue.QueueList>
            <LegacyQueue.QueueItem>Hidden</LegacyQueue.QueueItem>
          </LegacyQueue.QueueList>
        </LegacyQueue.QueueSectionContent>
      </LegacyQueue.QueueSection>
    </LegacyQueue.Queue>
  );
  const next = (
    <Next.QueuePanel className="w-96">
      <Next.QueueSection>
        <Next.QueueSectionTrigger>
          <Next.QueueSectionLabel count={2} label="queued" icon={<IconRefresh className="size-3.5" />} />
        </Next.QueueSectionTrigger>
        <Next.QueueSectionContent>
          <Next.QueuePanelList>
            {[false, true].map((done) => (
              <Next.QueuePanelItem key={String(done)}>
                <div className="flex items-start gap-2">
                  <Next.QueueItemIndicator completed={done} />
                  <Next.QueueItemContent completed={done}>Item</Next.QueueItemContent>
                  <Next.QueueItemActions>
                    <Next.QueueItemAction aria-label="Edit">
                      <IconCopy className="size-3.5" />
                    </Next.QueueItemAction>
                  </Next.QueueItemActions>
                </div>
              </Next.QueuePanelItem>
            ))}
          </Next.QueuePanelList>
        </Next.QueueSectionContent>
      </Next.QueueSection>
      <Next.QueueSection defaultOpen={false}>
        <Next.QueueSectionTrigger className="pr-2">
          <Next.QueueSectionLabel count={1} label="closed" />
        </Next.QueueSectionTrigger>
        <Next.QueueSectionContent>
          <Next.QueuePanelList>
            <Next.QueuePanelItem>Hidden</Next.QueuePanelItem>
          </Next.QueuePanelList>
        </Next.QueueSectionContent>
      </Next.QueueSection>
    </Next.QueuePanel>
  );

  test("open and closed sections", async () => {
    expect(await same(legacy, next)).toContain("motion-press");
  });

  test("toggle the first section", async () => {
    await same(legacy, next, () => {
      document.querySelector("button")?.click();
    });
  });
});

// ---------------------------------------------------------------------------
// Shimmer

describe("Shimmer", () => {
  // StreamingActivityDisplay, SandboxStartupIndicator / Steps, activity-tasks,
  // trace, plan, gallery.
  test.each([
    {},
    { as: "span" as const, duration: 2.5, spread: 1.5 },
    { as: "span" as const, duration: 2.5, spread: 1.5, className: "min-w-0 truncate" },
    { as: "span" as const, duration: 3, className: "text-sm" },
  ])("%o", async (props) => {
    expect(
      await same(
        <LegacyShimmer {...props}>Working for</LegacyShimmer>,
        <Next.Shimmer {...props}>Working for</Next.Shimmer>,
      ),
    ).toContain("shimmer-band");
  });
});

// ---------------------------------------------------------------------------
// CodeBlock

describe("CodeBlock", () => {
  test.each([
    { code: "const a = 1;", language: "ts" },
    { code: "const a = 1;", className: "min-w-0" },
  ])("default body %o", async (props) => {
    await same(<LegacyCodeBlock.CodeBlock {...props} />, <Next.CodeBlock {...props} />);
  });

  // activity-step-detail, AnnotationCommentCard, gallery: own `pre` + copy button.
  test("children replace the pre", async () => {
    const tree = (C: typeof LegacyCodeBlock | typeof Next) => (
      <C.CodeBlock code="<div />" language="html" className="text-xs">
        <C.CodeBlockCopyButton />
        <pre className="max-h-40 overflow-auto p-3 text-xs">
          <code>{"<div />"}</code>
        </pre>
      </C.CodeBlock>
    );
    expect(await same(tree(LegacyCodeBlock), tree(Next))).toContain("Copy code");
  });

  test("copy button shows the check after a click", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } });
    const tree = (C: typeof LegacyCodeBlock | typeof Next) => (
      <C.CodeBlock code="x">
        <C.CodeBlockCopyButton className="top-1" />
      </C.CodeBlock>
    );
    const html = await same(tree(LegacyCodeBlock), tree(Next), () => {
      document.querySelector("button")?.click();
    });
    expect(html).toContain("tabler-icon-check");
  });
});

// ---------------------------------------------------------------------------
// Artifact

describe("Artifact", () => {
  const tree = (A: typeof LegacyArtifact | typeof Next) => (
    <A.Artifact className="w-[28rem]">
      <A.ArtifactHeader>
        <div>
          <A.ArtifactTitle>Dashboard</A.ArtifactTitle>
          <A.ArtifactDescription>Updated 2 minutes ago</A.ArtifactDescription>
        </div>
        <A.ArtifactActions>
          <A.ArtifactAction icon={IconCopy} label="Copy" />
          <A.ArtifactAction label="Share">
            <IconShare className="size-4" />
          </A.ArtifactAction>
          <A.ArtifactClose />
          <A.ArtifactClose className="ml-1">x</A.ArtifactClose>
        </A.ArtifactActions>
      </A.ArtifactHeader>
      <A.ArtifactContent className="text-sm">Body</A.ArtifactContent>
    </A.Artifact>
  );

  test("all parts (actions without tooltip)", async () => {
    await same(tree(LegacyArtifact), tree(Next));
  });

  // Exception: with a tooltip, eva wrapped each action in its own
  // `TooltipProvider`; vvedantb uses the app's provider. Providers render no
  // DOM, and eva mounts one app-wide with the same delay, so the closed DOM is
  // compared here (the open tooltip body differs: eva wrapped the text in a
  // `<p>`, which carries no margin under Tailwind's preflight).
  test("action with tooltip (closed)", async () => {
    const html = await same(
      <LegacyTooltipProvider>
        <LegacyArtifact.ArtifactAction icon={IconDownload} tooltip="Download" />
      </LegacyTooltipProvider>,
      <Next.TooltipProvider>
        <Next.ArtifactAction icon={IconDownload} tooltip="Download" />
      </Next.TooltipProvider>,
    );
    expect(html).toContain('data-state="closed"');
  });
});

// ---------------------------------------------------------------------------
// Attachments, FileChip, Confirmation, Sandbox

describe("Attachments", () => {
  test.each(["grid", "inline", "list"] as const)("variant=%s", async (variant) => {
    const tree = (A: typeof LegacyAttachments | typeof Next) => (
      <A.Attachments variant={variant}>
        {SAMPLE_ATTACHMENTS.map((data) => (
          <A.Attachment data={data} key={data.id} onRemove={noop}>
            <A.AttachmentPreview />
            <A.AttachmentInfo showMediaType={variant === "list"} />
            <A.AttachmentRemove />
          </A.Attachment>
        ))}
        <A.Attachment data={SAMPLE_ATTACHMENTS[1]} className="opacity-50">
          <A.AttachmentPreview fallbackIcon={<IconCopy />} className="p-1" />
          <A.AttachmentInfo className="text-xs" />
          <A.AttachmentRemove />
        </A.Attachment>
      </A.Attachments>
    );
    await same(tree(LegacyAttachments), tree(Next));
  });

  test("AttachmentEmpty and hover card", async () => {
    const tree = (A: typeof LegacyAttachments | typeof Next) => (
      <>
        <A.AttachmentEmpty />
        <A.AttachmentEmpty className="p-2">Nothing</A.AttachmentEmpty>
        <A.Attachments>
          <A.Attachment data={SAMPLE_ATTACHMENTS[0]}>
            <A.AttachmentHoverCard open>
              <A.AttachmentHoverCardTrigger asChild>
                <span>hover</span>
              </A.AttachmentHoverCardTrigger>
              <A.AttachmentHoverCardContent>preview</A.AttachmentHoverCardContent>
            </A.AttachmentHoverCard>
          </A.Attachment>
        </A.Attachments>
      </>
    );
    expect(await same(tree(LegacyAttachments), tree(Next))).toContain("preview");
  });
});

describe("FileChip", () => {
  test("plain and clickable", async () => {
    await same(
      <>
        <LegacyFileChip name="a.tsx" />
        <LegacyFileChip name="b.tsx" path="src/b.tsx" />
        <LegacyFileChip name="c.tsx" path="src/c.tsx" onOpenFile={noop} />
      </>,
      <>
        <Next.FileChip name="a.tsx" />
        <Next.FileChip name="b.tsx" path="src/b.tsx" />
        <Next.FileChip name="c.tsx" path="src/c.tsx" onOpenFile={noop} />
      </>,
    );
  });
});

describe("Confirmation", () => {
  test.each(["pending", "accepted", "rejected"] as const)("state=%s", async (state) => {
    const tree = (C: typeof LegacyConfirmation | typeof Next) => (
      <C.Confirmation state={state} className="w-80">
        <C.ConfirmationTitle>
          <C.ConfirmationRequest>Run it?</C.ConfirmationRequest>
          <C.ConfirmationAccepted>Approved.</C.ConfirmationAccepted>
          <C.ConfirmationRejected>Rejected.</C.ConfirmationRejected>
        </C.ConfirmationTitle>
        <C.ConfirmationActions>
          <C.ConfirmationAction variant="outline">Reject</C.ConfirmationAction>
          <C.ConfirmationAction>Approve</C.ConfirmationAction>
        </C.ConfirmationActions>
      </C.Confirmation>
    );
    await same(tree(LegacyConfirmation), tree(Next));
  });
});

describe("Sandbox", () => {
  test.each(["pending", "running", "completed", "error"] as const)("state=%s", async (state) => {
    const tree = (S: typeof LegacySandbox | typeof Next, C: typeof LegacyCodeBlock | typeof Next) => (
      <S.Sandbox state={state} className="w-96">
        <S.SandboxContent>
          <S.SandboxTabs defaultValue="code">
            <S.SandboxTabsList>
              <S.SandboxTabsTrigger value="code">Code</S.SandboxTabsTrigger>
              <S.SandboxTabsTrigger value="output">Output</S.SandboxTabsTrigger>
            </S.SandboxTabsList>
            <S.SandboxTabContent value="code">
              <C.CodeBlock code="print('hello')" language="python" />
            </S.SandboxTabContent>
            <S.SandboxTabContent value="output">hello</S.SandboxTabContent>
          </S.SandboxTabs>
        </S.SandboxContent>
      </S.Sandbox>
    );
    await same(tree(LegacySandbox, LegacyCodeBlock), tree(Next, Next), undefined, stripTabsVariant);
  });
});

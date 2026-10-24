import {
  ActivityQuestionCard,
  ActivityTasks,
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextTrigger,
  ActivityThinkingIcon,
  ModelPickerContent,
  ModelSelect,
  modelPickerSurfaceClass,
  PromptInputSettings,
  PromptInputSpeech,
  ProviderIcon,
  TraitsPanel,
} from "@vvedantb/ui";
import { GalleryGroup, GalleryItem } from "./GalleryItem";
import {
  PlanSpecimen,
  TestResultsSpecimen,
  TraceSpecimens,
  WebPreviewSpecimen,
} from "./AiActivityParts";
import {
  GALLERY_ANSWERS,
  GALLERY_QUESTIONS,
  GALLERY_STEPS,
  MODEL_ACCOUNTS,
  MODEL_OPTIONS,
  SHORT_STEPS,
} from "./aiActivityFixtures";

const noop = () => {};

const PROVIDERS = ["claude", "codex", "opencode", "cursor", "unknown"] as const;

const TRAITS_CONFIG = {
  reasoning: { levels: ["low", "medium", "high"], default: "medium" },
  thinkingToggle: true,
  contextWindow1m: true,
  fastMode: true,
};

function GalleryTraitsPanel() {
  return (
    <TraitsPanel
      config={TRAITS_CONFIG}
      effortLevel="high"
      thinkingEnabled
      use1mContext={false}
      fastMode={false}
      getLevelLabel={(level) => level.charAt(0).toUpperCase() + level.slice(1)}
      onEffortLevelChange={noop}
      onThinkingEnabledChange={noop}
      onUse1mContextChange={noop}
      onFastModeChange={noop}
    />
  );
}

function ActivityGroup() {
  return (
    <GalleryGroup title="ActivityTasks">
      <GalleryItem
        label="ActivityTasks layout=folded (capped at 8 rows)"
        className="w-[420px]"
      >
        <ActivityTasks steps={GALLERY_STEPS} layout="folded" />
      </GalleryItem>
      <GalleryItem
        label="ActivityTasks layout=inline (all rows, active step last)"
        className="w-[420px]"
      >
        <ActivityTasks steps={GALLERY_STEPS} layout="inline" />
      </GalleryItem>
      <GalleryItem
        label='ActivityTasks folded settled (duration="2m 14s")'
        className="w-[420px]"
      >
        <ActivityTasks steps={SHORT_STEPS} duration="2m 14s" />
      </GalleryItem>
      <GalleryItem
        label="ActivityQuestionCard (answered + unanswered)"
        className="w-[420px]"
      >
        <ActivityQuestionCard
          questions={GALLERY_QUESTIONS}
          answers={GALLERY_ANSWERS}
        />
      </GalleryItem>
      <GalleryItem label="EvaThinkingIcon">
        <ActivityThinkingIcon />
      </GalleryItem>
    </GalleryGroup>
  );
}

function ModelGroup() {
  return (
    <GalleryGroup title="Models and composer settings">
      <GalleryItem label="ProviderIcon (claude / codex / opencode / cursor / fallback)">
        <div className="flex items-center gap-3">
          {PROVIDERS.map((provider) => (
            <ProviderIcon key={provider} provider={provider} size={20} />
          ))}
        </div>
      </GalleryItem>
      <GalleryItem label="ModelSelect (trigger; popover open state is internal)">
        <ModelSelect
          value="claude-opus"
          onValueChange={noop}
          options={MODEL_OPTIONS}
          triggerSuffix="High"
          showFastIcon
        />
      </GalleryItem>
      <GalleryItem label="PromptInputSettings (trigger; menu open state is internal)">
        <PromptInputSettings
          model="claude-sonnet"
          onModelChange={noop}
          options={MODEL_OPTIONS}
        />
      </GalleryItem>
      <GalleryItem label="PromptInputSpeech (disabled; null without SpeechRecognition)">
        <PromptInputSpeech disabled />
      </GalleryItem>
      <GalleryItem label="TraitsPanel" className="w-80">
        <GalleryTraitsPanel />
      </GalleryItem>
      <GalleryItem label="ModelPickerContent (inline, with accounts + traits header)">
        <div className={`${modelPickerSurfaceClass} bg-popover`}>
          <ModelPickerContent
            value="claude-opus"
            accountId={null}
            options={MODEL_OPTIONS}
            accounts={MODEL_ACCOUNTS}
            onSelect={noop}
            header={<GalleryTraitsPanel />}
          />
        </div>
      </GalleryItem>
    </GalleryGroup>
  );
}

function ContextGroup() {
  return (
    <GalleryGroup title="Context (hover card forced open)">
      <GalleryItem
        label="Context open: header / body usage rows / footer"
        className="h-[420px]"
      >
        <Context
          open
          onOpenChange={noop}
          usedTokens={84_000}
          maxTokens={200_000}
          usage={{
            inputTokens: 52_000,
            outputTokens: 12_000,
            cachedInputReadTokens: 18_000,
            cachedInputWriteTokens: 2_000,
          }}
          costs={{
            totalUSD: 0.4821,
            inputUSD: 0.156,
            outputUSD: 0.18,
            cacheReadUSD: 0.0054,
            cacheWriteUSD: 0.0075,
          }}
        >
          <ContextTrigger />
          <ContextContent align="start" side="bottom">
            <ContextContentHeader />
            <ContextContentBody>
              <ContextInputUsage />
              <ContextOutputUsage />
              <ContextCacheUsage />
            </ContextContentBody>
            <ContextContentFooter />
          </ContextContent>
        </Context>
      </GalleryItem>
    </GalleryGroup>
  );
}

export function AiActivitySection() {
  return (
    <>
      <ActivityGroup />
      <GalleryGroup title="Trace, Plan, TestResults, WebPreview">
        <TraceSpecimens />
        <PlanSpecimen />
        <TestResultsSpecimen />
        <WebPreviewSpecimen />
      </GalleryGroup>
      <ModelGroup />
      <ContextGroup />
    </>
  );
}

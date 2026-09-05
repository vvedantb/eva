"use client";

import {
  IconLoader2,
  IconMicrophone,
  IconPlayerStop,
} from "@tabler/icons-react";
import { useQuery } from "convex/react";
import { api } from "@eva/backend";
import {
  PromptInputButton,
  getSpeechRecognition,
  usePromptInputController,
  useSpeechRecognition,
} from "@eva/ui";
import { useGatewayDictation } from "@/lib/hooks/useGatewayDictation";
import { useTranscriptPolish } from "@/lib/hooks/useTranscriptPolish";

/**
 * Mic control for chat composers. When voice dictation is enabled, streams
 * through AI Gateway STT; otherwise falls back to the browser Web Speech API
 * wired through the prompt controller (fixes the old textarea-query no-op).
 */
export function ComposerSpeechButton({ disabled }: { disabled?: boolean }) {
  const flags = useQuery(api.auth.getExperimentalFlags);
  const voiceEnabled = flags?.voiceDictation;
  const { textInput } = usePromptInputController();

  if (voiceEnabled === true) {
    return (
      <GatewaySpeechButton
        disabled={disabled}
        value={textInput.value}
        setInput={textInput.setInput}
      />
    );
  }

  if (voiceEnabled === false && getSpeechRecognition()) {
    return (
      <WebSpeechButton
        disabled={disabled}
        value={textInput.value}
        setInput={textInput.setInput}
      />
    );
  }

  // Still loading the flag, or web speech unavailable with flag off.
  return null;
}

function GatewaySpeechButton({
  disabled,
  value,
  setInput,
}: {
  disabled?: boolean;
  value: string;
  setInput: (value: string) => void;
}) {
  const { isListening, isConnecting, toggle } = useGatewayDictation(setInput);
  const { isPolishing, handleToggle } = useTranscriptPolish({ value, setInput });

  const label = isPolishing
    ? "Polishing…"
    : isConnecting
      ? "Connecting…"
      : isListening
        ? "Stop recording"
        : "Voice input";

  return (
    <PromptInputButton
      tooltip={label}
      // The tooltip is hover-only, so on touch this is the button's only name.
      aria-label={label}
      onClick={() => handleToggle({ isListening, toggle })}
      disabled={disabled || isConnecting || isPolishing}
      className={isListening && !isConnecting ? "text-destructive" : undefined}
    >
      {isConnecting || isPolishing ? (
        <IconLoader2 className="size-4 animate-spin" />
      ) : isListening ? (
        <IconPlayerStop className="size-4" />
      ) : (
        <IconMicrophone className="size-4" />
      )}
    </PromptInputButton>
  );
}

function WebSpeechButton({
  disabled,
  value,
  setInput,
}: {
  disabled?: boolean;
  value: string;
  setInput: (value: string) => void;
}) {
  const { isListening, toggle } = useSpeechRecognition(setInput);
  const { isPolishing, handleToggle } = useTranscriptPolish({ value, setInput });

  const label = isPolishing
    ? "Polishing…"
    : isListening
      ? "Stop recording"
      : "Voice input";

  return (
    <PromptInputButton
      tooltip={label}
      aria-label={label}
      onClick={() => handleToggle({ isListening, toggle })}
      disabled={disabled || isPolishing}
      className={isListening ? "text-destructive" : undefined}
    >
      {isPolishing ? (
        <IconLoader2 className="size-4 animate-spin" />
      ) : isListening ? (
        <IconPlayerStop className="size-4" />
      ) : (
        <IconMicrophone className="size-4" />
      )}
    </PromptInputButton>
  );
}

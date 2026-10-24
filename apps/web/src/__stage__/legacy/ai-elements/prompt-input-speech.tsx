"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconMicrophone, IconPlayerStop } from "@tabler/icons-react";
import { PromptInputButton } from "./prompt-input";

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: { transcript: string; confidence: number };
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(onUpdate: (fullText: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const prefixRef = useRef("");
  const finalsRef = useRef("");

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const start = useCallback(
    (prefix: string) => {
      const SR = getSpeechRecognition();
      if (!SR) return;

      const separator = prefix && !prefix.endsWith(" ") ? " " : "";
      prefixRef.current = prefix + separator;
      finalsRef.current = "";

      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finals = "";
        let interim = "";
        for (let i = 0; i < event.results.length; i++) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finals += text;
          } else {
            interim += text;
          }
        }
        finalsRef.current = finals;
        onUpdateRef.current(prefixRef.current + finals + interim);
      };

      recognition.onerror = () => {
        stop();
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    },
    [stop],
  );

  const toggle = useCallback(
    (prefix: string) => {
      if (isListening) {
        stop();
      } else {
        start(prefix);
      }
    },
    [isListening, start, stop],
  );

  useEffect(() => stop, [stop]);

  return { isListening, toggle };
}

interface PromptInputSpeechProps {
  disabled?: boolean;
}

export function PromptInputSpeech({ disabled }: PromptInputSpeechProps) {
  if (!getSpeechRecognition()) return null;

  return <SpeechButton disabled={disabled} />;
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  if (!setter) return;
  setter.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function SpeechButton({ disabled }: PromptInputSpeechProps) {
  const updateText = useCallback((fullText: string) => {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="message"]',
    );
    if (!textarea) return;
    setTextareaValue(textarea, fullText);
    textarea.focus();
  }, []);

  const { isListening, toggle } = useSpeechRecognition(updateText);

  const handleToggle = useCallback(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="message"]',
    );
    toggle(textarea?.value ?? "");
  }, [toggle]);

  return (
    <PromptInputButton
      tooltip={isListening ? "Stop recording" : "Voice input"}
      onClick={handleToggle}
      disabled={disabled}
      className={isListening ? "text-destructive" : ""}
    >
      {isListening ? (
        <IconPlayerStop className="size-4" />
      ) : (
        <IconMicrophone className="size-4" />
      )}
    </PromptInputButton>
  );
}

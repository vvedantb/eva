"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import { toast } from "@vvedantb/ui";

const MIN_POLISH_WORDS = 10;

function dictationPrefix(value: string) {
  if (value === "") return "";
  if (value.endsWith(" ")) return value;
  return `${value} `;
}

function wordCount(text: string) {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

async function polishOrEmpty(
  polish: (args: { transcript: string }) => Promise<string>,
  transcript: string,
) {
  try {
    return await polish({ transcript });
  } catch (error) {
    console.error("[useTranscriptPolish]", error);
    return "";
  }
}

type ToggleArgs = {
  isListening: boolean;
  toggle: (prefix: string) => void;
};

/**
 * Wraps the stop side of a dictation `toggle` so the dictated segment gets
 * rewritten by `textGen.polishTranscript` — "um"s and self-corrections
 * removed — with an Undo toast. The raw transcript still streams in live while
 * listening; only the final text is swapped.
 */
export function useTranscriptPolish({
  value,
  setInput,
}: {
  value: string;
  setInput: (value: string) => void;
}) {
  const polishTranscript = useAction(api.textGen.polishTranscript);
  const [isPolishing, setIsPolishing] = useState(false);
  const latestValueRef = useRef(value);
  useEffect(() => {
    latestValueRef.current = value;
  });
  const prefixRef = useRef<string | null>(null);
  const generationRef = useRef(0);

  const runPolish = async (
    prefix: string,
    segment: string,
    generation: number,
  ) => {
    setIsPolishing(true);
    const polished = await polishOrEmpty(polishTranscript, segment);
    if (generationRef.current !== generation) return;
    setIsPolishing(false);

    if (polished === "") return;
    if (polished === segment) return;

    const raw = prefix + segment;
    if (latestValueRef.current !== raw) return;

    setInput(prefix + polished);
    toast.success("Transcript polished", {
      action: {
        label: "Undo",
        onClick: () => setInput(raw),
      },
    });
  };

  const handleToggle = ({ isListening, toggle }: ToggleArgs) => {
    const current = latestValueRef.current;

    if (!isListening) {
      generationRef.current += 1;
      setIsPolishing(false);
      prefixRef.current = dictationPrefix(current);
      toggle(current);
      return;
    }

    const prefix = prefixRef.current;
    prefixRef.current = null;
    toggle(current);

    if (prefix === null) return;
    if (!current.startsWith(prefix)) return;

    const segment = current.slice(prefix.length);
    if (wordCount(segment) < MIN_POLISH_WORDS) return;

    void runPolish(prefix, segment, generationRef.current);
  };

  return { isPolishing, handleToggle };
}

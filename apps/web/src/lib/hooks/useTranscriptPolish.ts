"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import { toast } from "@vvedantb/ui";

/** Below this a round-trip costs more than the polish is worth. */
const MIN_POLISH_WORDS = 10;

/**
 * Both dictation hooks push `prefix + separator + transcript` into the
 * composer, so the separator has to be mirrored here for the prefix to strip
 * cleanly back off when dictation stops.
 */
function dictationPrefix(value: string) {
  if (value === "") return "";
  if (value.endsWith(" ")) return value;
  return `${value} `;
}

function wordCount(text: string) {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Kept outside the hook: a `try` inside a compiled function makes React
 * Compiler bail on the whole file. A rejected polish is not an error the user
 * needs to see — dictation must never lose words, so it degrades to the raw
 * transcript.
 */
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
  /** Whether dictation is currently running, i.e. this click is a STOP. */
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
  // The polish result lands after an await, so the swap must compare against
  // the composer's value *then*, not the one captured at the stop click.
  // Latest-ref via effect, not a render-time write — the React Compiler
  // rejects ref writes during render and bails on the whole file.
  const latestValueRef = useRef(value);
  useEffect(() => {
    latestValueRef.current = value;
  });
  const prefixRef = useRef<string | null>(null);
  // Bumped on every dictation start, so a swap still in flight is abandoned.
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

    // "" means the backend gave up; keep the raw transcript, stay silent.
    if (polished === "") return;
    if (polished === segment) return;

    const raw = prefix + segment;
    // Typed or edited while polishing — their text wins, drop the swap.
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
      // Starting: void any pending swap, then remember what was already typed.
      generationRef.current += 1;
      setIsPolishing(false);
      prefixRef.current = dictationPrefix(current);
      toggle(current);
      return;
    }

    // Stopping: stop the mic first, then decide whether the segment is worth a
    // round-trip.
    const prefix = prefixRef.current;
    prefixRef.current = null;
    toggle(current);

    if (prefix === null) return;
    // Edited mid-dictation, so the segment can no longer be isolated.
    if (!current.startsWith(prefix)) return;

    const segment = current.slice(prefix.length);
    if (wordCount(segment) < MIN_POLISH_WORDS) return;

    void runPolish(prefix, segment, generationRef.current);
  };

  return { isPolishing, handleToggle };
}

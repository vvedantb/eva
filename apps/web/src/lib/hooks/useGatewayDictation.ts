"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import { toast } from "@vvedantb/ui";

export type GatewayDictationStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "error";

/** xAI grok-stt native rate — avoids extra server-side resampling. */
const TARGET_SAMPLE_RATE = 16_000;

/**
 * Inline AudioWorklet: Float32 mic frames → Int16 LE mono PCM at the target
 * rate, resampling when the AudioContext cannot run at that rate.
 */
const PCM_WORKLET_SOURCE = `
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) return true;
    const ratio = sampleRate / ${TARGET_SAMPLE_RATE};
    const outLen = Math.max(1, Math.floor(input.length / ratio));
    const pcm = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const srcIndex = i * ratio;
      const i0 = Math.floor(srcIndex);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const frac = srcIndex - i0;
      const sample = input[i0] * (1 - frac) + input[i1] * frac;
      const clipped = Math.max(-1, Math.min(1, sample));
      pcm[i] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
    }
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}
registerProcessor("eva-pcm-processor", PcmProcessor);
`;

type DictationSession = {
  mediaStream: MediaStream;
  audioContext: AudioContext;
  workletNode: AudioWorkletNode;
  sourceNode: MediaStreamAudioSourceNode;
  closeAudio: () => void;
};

function stopMediaTracks(mediaStream: MediaStream) {
  for (const track of mediaStream.getTracks()) {
    track.stop();
  }
}

// Module-level so the dynamic import() stays outside the hook body — the
// React Compiler cannot lower import expressions and bails out of memoizing
// the whole file when one appears inside a compiled function.
function loadGatewayDictationSdk() {
  return import(
    /* webpackChunkName: "gateway-dictation" */ "./gatewayDictationSdk"
  );
}

function dictationErrorMessage(
  error: object | string | number | boolean | null,
) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  return "Voice dictation stopped unexpectedly";
}

type TranscriptHandlers = {
  isCurrent: () => boolean;
  shouldIgnoreErrors: () => boolean;
  onDelta: (delta: string) => void;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onStreamError: (message: string) => void;
};

/**
 * Consumes the AI SDK transcription stream. Kept outside the hook's `try`
 * so React Compiler does not bail on `for await` / ternaries in try blocks.
 */
async function consumeTranscriptionStream(
  fullStream: AsyncIterable<{ type: string }>,
  handlers: TranscriptHandlers,
) {
  for await (const part of fullStream) {
    if (!handlers.isCurrent()) break;
    if (part.type === "transcript-delta") {
      if ("delta" in part && typeof part.delta === "string") {
        handlers.onDelta(part.delta);
      }
    } else if (part.type === "transcript-partial") {
      if ("text" in part && typeof part.text === "string") {
        handlers.onPartial(part.text);
      }
    } else if (part.type === "transcript-final") {
      if ("text" in part && typeof part.text === "string") {
        handlers.onFinal(part.text);
      }
    } else if (part.type === "error") {
      if (handlers.shouldIgnoreErrors()) return;
      let message = "Voice dictation stopped unexpectedly";
      if ("error" in part) {
        const err = part.error;
        if (err instanceof Error || typeof err === "string") {
          message = dictationErrorMessage(err);
        }
      }
      handlers.onStreamError(message);
      return;
    }
  }
}

/**
 * Live speech-to-text through AI Gateway streaming STT. Mints a short-lived
 * token from Convex, captures mic PCM, and pushes transcript updates via
 * `onText` (prefix + committed finals + pending deltas).
 */
export function useGatewayDictation(onText: (fullText: string) => void) {
  const mintToken = useAction(api.transcription.mintTranscriptionToken);
  const [status, setStatus] = useState<GatewayDictationStatus>("idle");
  const onTextRef = useRef(onText);
  // Latest-ref via effect, not a render-time write — the React Compiler
  // rejects ref writes during render and bails on the whole file.
  useEffect(() => {
    onTextRef.current = onText;
  });
  const sessionRef = useRef<DictationSession | null>(null);
  const streamReaderCancelRef = useRef<(() => void) | null>(null);
  const generationRef = useRef(0);

  const cleanup = useCallback(() => {
    streamReaderCancelRef.current?.();
    streamReaderCancelRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      session.closeAudio();
    }
  }, []);

  // Mic + WebSocket session must stop when the composer unmounts.
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      cleanup();
    };
  }, [cleanup]);

  const stop = useCallback(() => {
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  const start = useCallback(
    async (prefix: string) => {
      if (sessionRef.current) return;

      const generation = generationRef.current + 1;
      generationRef.current = generation;
      setStatus("connecting");

      const separator = prefix && !prefix.endsWith(" ") ? " " : "";
      const textPrefix = prefix + separator;
      let committed = "";
      let pending = "";

      const publish = () => {
        onTextRef.current(textPrefix + committed + pending);
      };

      // Create the context synchronously in the click turn so browsers allow
      // resume(); awaiting the token first leaves the context suspended and
      // the worklet never emits PCM → Gateway closes the socket.
      const audioContext = new AudioContext();
      const abortController = new AbortController();

      try {
        await audioContext.resume();

        const [{ token, modelId }, mediaStream] = await Promise.all([
          mintToken({}),
          navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
            },
          }),
        ]);
        if (generationRef.current !== generation) {
          stopMediaTracks(mediaStream);
          void audioContext.close();
          return;
        }

        // Resume again after the async gap — some browsers re-suspend.
        if (audioContext.state !== "running") {
          await audioContext.resume();
        }

        const blob = new Blob([PCM_WORKLET_SOURCE], {
          type: "application/javascript",
        });
        const workletUrl = URL.createObjectURL(blob);
        const addModule = audioContext.audioWorklet.addModule(workletUrl);
        void addModule.then(
          () => URL.revokeObjectURL(workletUrl),
          () => URL.revokeObjectURL(workletUrl),
        );
        await addModule;

        const sourceNode = audioContext.createMediaStreamSource(mediaStream);
        const workletNode = new AudioWorkletNode(
          audioContext,
          "eva-pcm-processor",
        );
        sourceNode.connect(workletNode);
        // Worklets only run when connected into the graph; mute so mic isn't
        // played back through speakers.
        const mute = audioContext.createGain();
        mute.gain.value = 0;
        workletNode.connect(mute);
        mute.connect(audioContext.destination);

        let streamController: ReadableStreamDefaultController<Uint8Array> | null =
          null;

        const onPcmMessage = (event: MessageEvent<ArrayBuffer>) => {
          if (event.data.byteLength === 0) return;
          if (streamController === null) return;
          streamController.enqueue(new Uint8Array(event.data));
        };

        const audio = new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            workletNode.port.addEventListener("message", onPcmMessage);
            workletNode.port.start();
          },
          cancel() {
            workletNode.port.removeEventListener("message", onPcmMessage);
          },
        });

        const closeAudio = () => {
          abortController.abort();
          workletNode.port.removeEventListener("message", onPcmMessage);
          try {
            workletNode.disconnect();
          } catch {
            // already disconnected
          }
          try {
            sourceNode.disconnect();
          } catch {
            // already disconnected
          }
          stopMediaTracks(mediaStream);
          void audioContext.close();
          if (streamController) {
            try {
              streamController.close();
            } catch {
              // already closed
            }
            streamController = null;
          }
        };

        sessionRef.current = {
          mediaStream,
          audioContext,
          workletNode,
          sourceNode,
          closeAudio,
        };

        streamReaderCancelRef.current = () => {
          closeAudio();
        };

        const { experimental_streamTranscribe, createGateway } =
          await loadGatewayDictationSdk();

        if (generationRef.current !== generation) {
          cleanup();
          return;
        }

        // Browser uses the short-lived `vcst_` token as apiKey — never the
        // server Gateway credential. Model id must match the token scope.
        const clientGateway = createGateway({ apiKey: token });
        const result = experimental_streamTranscribe({
          model: clientGateway.transcription(modelId),
          audio,
          inputAudioFormat: { type: "audio/pcm", rate: TARGET_SAMPLE_RATE },
          abortSignal: abortController.signal,
        });

        setStatus("listening");

        void (async () => {
          try {
            await consumeTranscriptionStream(result.fullStream, {
              isCurrent: () => generationRef.current === generation,
              shouldIgnoreErrors: () =>
                abortController.signal.aborted ||
                generationRef.current !== generation,
              onDelta: (delta) => {
                pending += delta;
                publish();
              },
              onPartial: (text) => {
                pending = text;
                publish();
              },
              onFinal: (text) => {
                committed += text;
                pending = "";
                publish();
              },
              onStreamError: (message) => {
                console.error("[useGatewayDictation] stream error:", message);
                toast.error(message);
                cleanup();
                setStatus("error");
              },
            });
          } catch (error) {
            if (generationRef.current !== generation) return;
            if (abortController.signal.aborted) {
              cleanup();
              setStatus("idle");
              return;
            }
            console.error("[useGatewayDictation]", error);
            toast.error(
              error instanceof Error
                ? dictationErrorMessage(error)
                : "Voice dictation stopped unexpectedly",
            );
            cleanup();
            setStatus("error");
            return;
          }
          if (generationRef.current === generation) {
            cleanup();
            setStatus("idle");
          }
        })();
      } catch (error) {
        if (generationRef.current !== generation) return;
        console.error("[useGatewayDictation]", error);
        void audioContext.close();
        toast.error(
          error instanceof Error
            ? dictationErrorMessage(error)
            : "Could not start dictation",
        );
        cleanup();
        setStatus("error");
      }
    },
    [cleanup, mintToken],
  );

  const toggle = useCallback(
    (prefix: string) => {
      if (status === "listening" || status === "connecting") {
        stop();
        return;
      }
      void start(prefix);
    },
    [start, status, stop],
  );

  return {
    status,
    isListening: status === "listening" || status === "connecting",
    isConnecting: status === "connecting",
    start,
    stop,
    toggle,
  };
}

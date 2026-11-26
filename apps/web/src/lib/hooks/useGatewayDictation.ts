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

const TARGET_SAMPLE_RATE = 16_000;

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

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      cleanup();
    };
  }, [cleanup]);

  const stop = useCallback(() => {
    generationRef.current += 1;
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
        if (generationRef.current !== generation) {
          stopMediaTracks(mediaStream);
          void audioContext.close();
          return;
        }

        const sourceNode = audioContext.createMediaStreamSource(mediaStream);
        const workletNode = new AudioWorkletNode(
          audioContext,
          "eva-pcm-processor",
        );
        sourceNode.connect(workletNode);
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
          }
          try {
            sourceNode.disconnect();
          } catch {
          }
          stopMediaTracks(mediaStream);
          void audioContext.close();
          if (streamController) {
            try {
              streamController.close();
            } catch {
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
          closeAudio();
          const currentSession = sessionRef.current;
          if (currentSession) {
            if (currentSession.audioContext === audioContext) {
              sessionRef.current = null;
              streamReaderCancelRef.current = null;
            }
          }
          return;
        }

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
        if (generationRef.current !== generation) {
          void audioContext.close();
          return;
        }
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

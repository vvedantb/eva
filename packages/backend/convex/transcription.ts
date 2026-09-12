"use node";

import { gateway } from "@ai-sdk/gateway";
import { v } from "convex/values";
import { resolveExperimentalFlags } from "./_auth/experimentalFlags";
import { isSandboxIdentity } from "./_auth/sandboxIdentity";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

/**
 * Hardcoded streaming STT model. Swap here based on feedback — not a user
 * setting. $0.20/hr streaming via AI Gateway.
 *
 * TODO: team-wide AI Gateway ZDR currently blocks this model — turn ZDR off
 * (or add a ZDR-attested xAI BYOK key) when ready to use voice dictation.
 */
const TRANSCRIPTION_MODEL = "xai/grok-stt";

const GATEWAY_TRANSCRIPTION_URL =
  "https://ai-gateway.vercel.sh/v4/ai/transcription-model";

/** ~100ms of silence at 16 kHz PCM16 — enough to probe provider routing. */
const ZDR_PROBE_PCM = new Uint8Array(3200);

function messageFromUnknownError(
  error: object | string | number | boolean | null,
) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function zdrBlockedMessage(text: string) {
  if (!text.toLowerCase().includes("zdr")) return null;
  return (
    "Voice dictation is blocked by AI Gateway Zero Data Retention — " +
    `${TRANSCRIPTION_MODEL} has no ZDR-compliant provider. ` +
    "Turn off team-wide ZDR in the AI Gateway dashboard, or add a " +
    "ZDR-attested BYOK key for this model."
  );
}

/**
 * Browser WS upgrades hide the HTTP error body, so ZDR rejections look like
 * generic connection failures. Probe the HTTP transcription route with the
 * server credential and surface a clear error before minting a client token.
 */
async function assertTranscriptionRoutable(apiKey: string) {
  const response = await fetch(GATEWAY_TRANSCRIPTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "ai-model-id": TRANSCRIPTION_MODEL,
      "ai-transcription-model-specification-version": "4",
      "ai-gateway-protocol-version": "0.0.1",
      "ai-gateway-auth-method": "api-key",
    },
    body: JSON.stringify({
      audio: Buffer.from(ZDR_PROBE_PCM).toString("base64"),
      mediaType: "audio/pcm",
    }),
  });

  if (response.ok) return;

  const bodyText = await response.text();
  const zdrMessage = zdrBlockedMessage(bodyText);
  if (zdrMessage) {
    throw new Error(zdrMessage);
  }
  // Other probe failures (empty audio, etc.) are non-fatal — mint anyway.
  console.warn(
    "[transcription.mintTranscriptionToken] probe status",
    response.status,
    bodyText.slice(0, 300),
  );
}

/**
 * Mints a short-lived, model-scoped client token so the browser can open a
 * streaming transcription WebSocket without ever holding `AI_GATEWAY_API_KEY`.
 * Requires the caller to have voice dictation enabled.
 */
export const mintTranscriptionToken = action({
  args: {},
  returns: v.object({
    token: v.string(),
    url: v.string(),
    modelId: v.string(),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }

    const user = await ctx.runQuery(internal.auth.getUserByClerkId, {
      clerkId: identity.subject,
    });
    if (!user) {
      throw new Error("User not found");
    }
    if (resolveExperimentalFlags(user).voiceDictation !== true) {
      throw new Error("Voice dictation is not enabled");
    }

    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Voice dictation is not configured (missing AI Gateway key)",
      );
    }

    await assertTranscriptionRoutable(apiKey);

    try {
      const { token, url } = await gateway.experimental_transcription.getToken({
        model: TRANSCRIPTION_MODEL,
        expiresAfterSeconds: 300,
      });
      return { token, url, modelId: TRANSCRIPTION_MODEL };
    } catch (error) {
      console.error("[transcription.mintTranscriptionToken]", error);
      const zdrMessage = zdrBlockedMessage(
        messageFromUnknownError(
          error instanceof Error || typeof error === "string" ? error : null,
        ),
      );
      throw new Error(
        zdrMessage ?? "Could not start voice dictation. Try again in a moment.",
        { cause: error },
      );
    }
  },
});

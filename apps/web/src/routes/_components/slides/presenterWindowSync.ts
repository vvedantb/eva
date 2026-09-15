export const PRESENTER_CHANNEL = "eva-slides-presenter";
export const PRESENTER_WINDOW_NAME = "eva-presenter";

export type PresenterChannelMessage =
  | { type: "slide"; slide: number }
  | { type: "presenter-open" }
  | { type: "presenter-closed" };

export function postPresenterMessage(message: PresenterChannelMessage): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(PRESENTER_CHANNEL);
  channel.postMessage(message);
  channel.close();
}

export function openPresenterWindow(): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.searchParams.set("view", "presenter");
  const opened = window.open(
    url.toString(),
    PRESENTER_WINDOW_NAME,
    "popup,width=960,height=640,menubar=no,toolbar=no,location=no,status=no",
  );
  opened?.focus();
}

interface PresenterChannelHandlers {
  onSlide?: (slide: number) => void;
  onPresenterOpen?: () => void;
  onPresenterClosed?: () => void;
}

export function subscribePresenterChannel(
  handlers: PresenterChannelHandlers,
): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;

  const channel = new BroadcastChannel(PRESENTER_CHANNEL);
  channel.onmessage = (event: MessageEvent<PresenterChannelMessage>) => {
    const message = event.data;
    if (message.type === "slide") handlers.onSlide?.(message.slide);
    if (message.type === "presenter-open") handlers.onPresenterOpen?.();
    if (message.type === "presenter-closed") handlers.onPresenterClosed?.();
  };
  return () => channel.close();
}

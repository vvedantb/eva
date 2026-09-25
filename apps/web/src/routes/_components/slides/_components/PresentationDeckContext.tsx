import { createContext, use } from "react";

export interface PresentationDeck {
  sessionCode: string | undefined;
  participantKey: string;
  hostKey: string | null;
}

const PresentationDeckContext = createContext<PresentationDeck>({
  sessionCode: undefined,
  participantKey: "",
  hostKey: null,
});

export const PresentationDeckProvider = PresentationDeckContext.Provider;

export function usePresentationDeck(): PresentationDeck {
  return use(PresentationDeckContext);
}

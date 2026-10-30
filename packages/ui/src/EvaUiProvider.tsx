import type { ReactNode } from "react";
import { UiConfigProvider } from "@vvedantb/ui";
import { evaUiConfig } from "./config";

/** Gives every @vvedantb/ui component below it eva's classes and defaults. */
export function EvaUiProvider({ children }: { children?: ReactNode }) {
  return <UiConfigProvider config={evaUiConfig}>{children}</UiConfigProvider>;
}

// eva's app config for @vvedantb/ui. `EvaUiProvider` hands it to every
// vvedantb component, so they render eva's classes and defaults.
import type { UiConfig } from "@vvedantb/ui";
import { evaCn } from "./cn";
import { controlsConfig } from "./controls";
import { foundationsConfig } from "./foundations";
import { kiboMarkdownConfig } from "./kibo-markdown";
import { overlaysConfig } from "./overlays";

export const evaUiConfig: UiConfig = {
  cn: evaCn,
  ...foundationsConfig,
  ...controlsConfig,
  ...overlaysConfig,
  ...kiboMarkdownConfig,
};

import { ExpoWebRoot } from "@vvedantb/native-ui/expo-web-root";
import type { ReactNode } from "react";

/** Web build root (`expo export --platform web`), used for preview screenshots. */
export default function Root({ children }: { children: ReactNode }) {
  return <ExpoWebRoot>{children}</ExpoWebRoot>;
}

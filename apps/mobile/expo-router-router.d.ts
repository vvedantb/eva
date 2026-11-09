// native-ui 0.12.1 still imports `Router` from "expo-router", which Expo Router 57 renamed to `ImperativeRouter`.
// Delete this file (and its tsconfig include) when native-ui updates the import.
import type { ImperativeRouter } from "expo-router";

declare module "expo-router" {
  export type Router = ImperativeRouter;
}
